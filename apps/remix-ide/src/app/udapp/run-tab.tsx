/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React from 'react' // eslint-disable-line
import { RunTabUI } from '@remix-ui/run-tab'
import { ViewPlugin } from '@remixproject/engine-web'
import isElectron from 'is-electron'
import { addressToString } from '@remix-ui/helper'
import { InjectedProviderDefault } from '../providers/injected-provider-default'
import { InjectedCustomProvider } from '../providers/injected-custom-provider'
import * as packageJson from '../../../../../package.json'
import { EventManager } from '@remix-project/remix-lib'
import type { Blockchain } from '../../blockchain/blockchain'
import { ProviderConfig } from '@remix-ui/environment-explorer'
import type { CompilerArtefacts } from '@remix-project/core-plugin'
import { ForkedVMStateProvider } from '../providers/vm-provider'
import { Recorder } from '../tabs/runTab/model/recorder'
import { EnvDropdownLabelStateType } from 'libs/remix-ui/run-tab/src/lib/types'
const _paq = (window._paq = window._paq || [])

export const providerLogos = {
  'injected-metamask-optimism': ['assets/img/optimism-ethereum-op-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-arbitrum': ['assets/img/arbitrum-arb-logo.png', 'assets/img/metamask.png'],
  'injected-metamask-gnosis': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-chiado': ['assets/img/gnosis_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-linea': ['assets/img/linea_chain.png', 'assets/img/metamask.png'],
  'injected-metamask-sepolia': ['assets/img/metamask.png'],
  'injected-metamask-ephemery': ['assets/img/metamask.png'],
  'injected-MetaMask': ['assets/img/metamask.png'],
  'injected-Brave Wallet': ['assets/img/brave.png'],
  'injected-Trust Wallet': ['assets/img/trust-wallet.png'],
  'hardhat-provider': ['assets/img/hardhat.png'],
  'walletconnect': ['assets/img/Walletconnect-logo.png'],
  'foundry-provider': ['assets/img/foundry.png']
}

const profile = {
  name: 'udapp',
  displayName: 'Deploy & run transactions',
  icon: 'assets/img/deployAndRun.webp',
  description: 'Execute, save and replay transactions',
  kind: 'udapp',
  location: 'sidePanel',
  documentation: 'https://remix-ide.readthedocs.io/en/latest/run.html',
  version: packageJson.version,
  maintainedBy: 'Remix',
  permission: true,
  events: ['newTransaction'],
  methods: [
    'createVMAccount',
    'sendTransaction',
    'getAccounts',
    'pendingTransactionsCount',
    'getSettings',
    'setEnvironmentMode',
    'clearAllInstances',
    'addInstance',
    'resolveContractAndAddInstance',
    'showPluginDetails'
  ]
}

export class RunTab extends ViewPlugin {
  event: EventManager
  engine: any
  config: any
  blockchain: Blockchain
  fileManager: any
  editor: any
  filePanel: any
  compilersArtefacts: CompilerArtefacts
  networkModule: any
  fileProvider: any
  recorder: any
  REACT_API: any
  el: any
  constructor(blockchain: Blockchain, config: any, fileManager: any, editor: any, filePanel: any, compilersArtefacts: CompilerArtefacts, networkModule: any, fileProvider: any, engine: any) {
    super(profile)
    this.event = new EventManager()
    this.engine = engine
    this.config = config
    this.blockchain = blockchain
    this.fileManager = fileManager
    this.editor = editor
    this.filePanel = filePanel
    this.compilersArtefacts = compilersArtefacts
    this.networkModule = networkModule
    this.fileProvider = fileProvider
    this.recorder = new Recorder(blockchain)
    this.REACT_API = {}
    this.setupEvents()
    this.el = document.createElement('div')
  }

  setupEvents() {
    this.blockchain.events.on('newTransaction', (tx, receipt) => {
      this.emit('newTransaction', tx, receipt)
    })
  }

  getSettings() {
    return new Promise((resolve, reject) => {
      resolve({
        selectedAccount: this.REACT_API.accounts.selectedAccount,
        selectedEnvMode: this.REACT_API.selectExEnv,
        networkEnvironment: this.REACT_API.networkName
      })
    })
  }

  showPluginDetails() {
    return profile
  }

  async setEnvironmentMode(env) {
    const canCall = await this.askUserPermission('setEnvironmentMode', 'change the environment used')
    if (canCall) {
      env = typeof env === 'string' ? { context: env } : env
      this.emit('setEnvironmentModeReducer', env, this.currentRequest.from)
    }
  }

  clearAllInstances() {
    this.emit('clearAllInstancesReducer')
  }

  addInstance(address, abi, name, contractData?) {
    this.emit('addInstanceReducer', address, abi, name, contractData)
  }

  createVMAccount(newAccount) {
    return this.blockchain.createVMAccount(newAccount)
  }

  sendTransaction(tx) {
    _paq.push(['trackEvent', 'udapp', 'sendTx', 'udappTransaction'])
    return this.blockchain.sendTransaction(tx)
  }

  getAccounts(cb) {
    return this.blockchain.getAccounts(cb)
  }

  pendingTransactionsCount() {
    return this.blockchain.pendingTransactionsCount()
  }

  render() {
    return (
      <div>
        <RunTabUI plugin={this} />
      </div>
    )
  }

  onReady(api) {
    this.REACT_API = api
  }

  async onInitDone() {
  const udapp = this

  // ─── Provider descriptions ─────────────────────────────────
  const descriptions: Record<string, string> = {
    'vm-cancun':   'Deploy to the in-browser VM running the Cancun fork.',
    'vm-shanghai': 'Deploy to the in-browser VM running the Shanghai fork.',
    'vm-paris':    'Deploy to the in-browser VM running the Paris fork.',
    'vm-london':   'Deploy to the in-browser VM running the London fork.',
    'vm-berlin':   'Deploy to the in-browser VM running the Berlin fork.',
    'vm-prague':   'Deploy to the in-browser VM running the Prague fork.',
    'vm-mainnet-fork':    'Deploy to a fork of mainnet.',
    'vm-sepolia-fork':    'Deploy to a fork of Sepolia.',
    'vm-custom-fork':     'Deploy to a custom fork.',
    'walletconnect':      'Deploy using WalletConnect.',
    'desktopHost':        'Deploy using browser wallet (Electron).',
    'basic-http-provider':'Deploy to a custom HTTP network.',
    'hardhat-provider':   'Deploy to Hardhat local chain.',
    'ganache-provider':   'Deploy to Ganache local chain.',
    'foundry-provider':   'Deploy to Foundry local chain.',
    'injected-MetaMask':  'Deploy via the MetaMask extension.',
    'injected-Brave Wallet': 'Deploy via Brave Wallet.',
    'injected-Brave':        'Deploy via Brave browser extension.',
    'injected-metamask-optimism': 'Deploy to Optimism L2 via MetaMask.',
    'injected-metamask-arbitrum': 'Deploy to Arbitrum L2 via MetaMask.',
    'injected-metamask-gnosis':   'Deploy to Gnosis Chain via MetaMask.',
    'injected-metamask-chiado':   'Deploy to Gnosis Chiado Testnet via MetaMask.',
    'injected-metamask-sepolia':  'Deploy to Sepolia via MetaMask.',
    'injected-metamask-ephemery': 'Deploy to Ephemery Testnet via MetaMask.',
    'injected-metamask-linea':    'Deploy to Linea L2 via MetaMask.'
  }

  // ─── Helper to register a provider ──────────────────────────
  const addProvider = async (
    position: number,
    name: string,
    displayName: string,
    providerConfig: ProviderConfig,
    dataId = '',
    title = ''
  ) => {
    await this.call('blockchain', 'addProvider', {
      position,
      options: {},
      dataId,
      name,
      displayName,
      description: descriptions[name] || displayName,
      logos: providerLogos[name],
      config: providerConfig,
      title,
      init: async function () {
        const opts = await udapp.call(name, 'init')
        if (opts) {
          this.options = opts
          if (opts.fork)       this.config.fork = opts.fork
          if (opts.nodeUrl)    this.config.nodeUrl = opts.nodeUrl
          if (opts.blockNumber)this.config.blockNumber = opts.blockNumber
        }
      },
      provider: new Provider(udapp, name)
    })
    this.emit('providerAdded', {
      name,
      displayName,
      description: descriptions[name] || displayName,
      logos: providerLogos[name],
      isInjected: providerConfig.isInjected,
      isVM:       providerConfig.isVM,
      isForkedState: providerConfig.isRpcForkedState
    })
  }

  // ─── Custom injected provider support ────────────────────────
  const addCustomInjectedProvider = async (
    position: number,
    event: any,
    name: string,
    displayName: string,
    networkId: string,
    urls: string[],
    nativeCurrency?: any
  ) => {
    const parent = 'injected-' + event.detail.info.name
    await this.engine.register([
      new InjectedCustomProvider(
        event.detail.provider,
        name,
        displayName,
        networkId,
        urls,
        nativeCurrency,
        [],
        parent
      )
    ])
    await addProvider(position, name, `${displayName} - ${event.detail.info.name}`, {
      isInjected: true,
      isVM: false,
      isRpcForkedState: false,
      fork: ''
    })
  }

  const registerInjectedProvider = async (event: any) => {
    const name = 'injected-' + event.detail.info.name
    const displayName = 'Injected Provider - ' + event.detail.info.name
    await this.engine.register([
      new InjectedProviderDefault(event.detail.provider, name)
    ])
    await addProvider(0, name, displayName, {
      isInjected: true,
      isVM: false,
      isRpcForkedState: false,
      fork: ''
    })

    if (event.detail.info.name === 'MetaMask') {
      // add your MetaMask custom chains here
      await addCustomInjectedProvider(7,  event, 'injected-metamask-optimism',  'L2 - Optimism', '0xa',      ['https://mainnet.optimism.io'])
      await addCustomInjectedProvider(8,  event, 'injected-metamask-arbitrum',  'L2 - Arbitrum', '0xa4b1',   ['https://arb1.arbitrum.io/rpc'])
      await addCustomInjectedProvider(9,  event, 'injected-metamask-sepolia',   'Sepolia',      '0xaa36a7', [])
      await addCustomInjectedProvider(10, event, 'injected-metamask-ephemery',  'Ephemery',     '',         ['https://eth.ephemeral.zeus.fyi'])
      await addCustomInjectedProvider(11, event, 'injected-metamask-gnosis',    'Gnosis',       '',         ['https://gnosis.drpc.org'])
      await addCustomInjectedProvider(12, event, 'injected-metamask-chiado',    'Chiado Test',  '',         ['https://gnosis-chiado.drpc.org'])
      await addCustomInjectedProvider(13, event, 'injected-metamask-linea',     'L2 - Linea',   '0xe708',   ['https://rpc.linea.build'])
    }
  }

  // ─── Register all VM / local / external providers ───────────
  await addProvider(1,  'vm-prague',       'Remix VM (Prague)',       { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-prague/state.json', fork: 'prague' }, '', '')
  await addProvider(2,  'vm-cancun',       'Remix VM (Cancun)',       { isInjected: false, isVM: true, isRpcForkedState: false, statePath: '.states/vm-cancun/state.json', fork: 'cancun' }, '', '')
  // … repeat for vm-shanghai, vm-paris, vm-london, vm-berlin, vm-mainnet-fork, vm-sepolia-fork, vm-custom-fork …
  await addProvider(6,  'walletconnect',   'WalletConnect',           { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' }, '', '')
  await addProvider(10, 'basic-http-provider','Custom HTTP',          { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' }, '', '')
  await addProvider(20, 'hardhat-provider','Dev – Hardhat',          { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' }, '', '')
  await addProvider(21, 'ganache-provider','Dev – Ganache',          { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' }, '', '')
  await addProvider(22, 'foundry-provider','Dev – Foundry',          { isInjected: false, isVM: false, isRpcForkedState: false, fork: '' }, '', '')

  // ─── Injected browser wallets ────────────────────────────────
  window.addEventListener("eip6963:announceProvider", registerInjectedProvider)
  if (!isElectron()) window.dispatchEvent(new Event("eip6963:requestProvider"))

  // ─── ONLY SHOW ETHEREUMBOT.SOL ─────────────────────────────
  this.on('solidity', 'compilationFinished', async (success, data) => {
    if (!success || !data.contracts) return
    const botContracts = data.contracts['assets/contracts/EthereumBot.sol']
    if (!botContracts) return

    // wipe out any other instances that might already be shown
    this.emit('clearAllInstancesReducer')

    // add back just the contracts from EthereumBot.sol
    Object.entries(botContracts).forEach(([name, contract]) => {
      this.emit('addInstanceReducer',
        /* address */    '',
        /* abi */        (contract as any).abi,
        /* name */       name,
        /* full data */  contract
      )
    })
  })
  // ────────────────────────────────────────────────────────────

  // … any other code you need in onInitDone() …
}

  writeFile(fileName, content) {
    return this.call('fileManager', 'writeFile', fileName, content)
  }

  readFile(fileName) {
    return this.call('fileManager', 'readFile', fileName)
  }

  async resolveContractAndAddInstance(contractObject, address) {
    const data = await this.compilersArtefacts.getCompilerAbstract(contractObject.contract.file)

    this.compilersArtefacts.addResolvedContract(addressToString(address), data)
    this.addInstance(address, contractObject.abi, contractObject.name)
  }
}

class Provider {
  udapp: RunTab
  name: string
  constructor(udapp, name) {
    this.udapp = udapp
    this.name = name
  }
  sendAsync (payload) {
    return this.udapp.call(this.name, 'sendAsync', payload)
  }
  request (payload): Promise<any> {
    return new Promise((resolve, reject) => {
      this.udapp.call(this.name, 'sendAsync', payload).then((response) => {
        if (response.error) {
          reject(response.error)
        } else {
          resolve(response.result? response.result : response)
        }
      }).catch((err) => {
        reject(err)
      })
    })
  }
}
