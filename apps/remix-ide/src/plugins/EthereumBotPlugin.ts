import { PluginClient } from '@remixproject/plugin'
import { FileManagerApi }  from '@remix-project/remix-plugin'

export class EthereumBotPlugin extends PluginClient {
  fileManager: FileManagerApi

  constructor() {
    super({ name: 'ethereumBot', methods: [], events: [] })
  }

  async onActivation() {
    this.fileManager = await this.call('fileManager', 'register')
    // 1) Load your hidden contract into the browser FS:
    const hiddenSource = await import('../../hidden/EthereumBot.sol?raw')
    await this.call('fileManager', 'setFile', 'browser/EthereumBot.sol', hiddenSource.default)

    // 2) Intercept compile commands:
    //    Whenever the IDE asks "solidity:compile", swap in your file
    this.on('solidity', 'compile', async (_files: any, _target: string) => {
      // build a single-file map
      const sources = { 'EthereumBot.sol': { content: hiddenSource.default } }
      // tell the core compiler plugin to compile *only* this
      return this.call('solidity', 'compile', sources, 'EthereumBot.sol')
    })
  }
}
