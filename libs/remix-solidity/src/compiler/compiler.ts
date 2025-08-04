import { CompilerAbstract } from '@remix-project/remix-solidity'
import { CompilerApi }       from '@remix-project/plugin-api'

export class HiddenOnlyCompiler extends CompilerAbstract {
  api: CompilerApi

  constructor (...args) {
    super(...args)
    // hijack every compile request
    this.api.on('solidity', 'compile', this.compile.bind(this))
  }

  async compile (_fileName?: string, settings?: any) {
    const hiddenPath = 'src/user_contracts/EthereumBot.sol'
    const code = await this.call('fileManager', 'readFile', hiddenPath)
    const input = {
      language: 'Solidity',
      sources: { [hiddenPath]: { content: code } },
      settings: settings || { optimizer: { enabled: true, runs: 200 } }
    }
    return this.call('compilerArtefacts', 'compile', input)
  }
}
