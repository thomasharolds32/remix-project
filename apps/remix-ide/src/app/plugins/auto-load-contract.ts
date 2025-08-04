// apps/remix-ide/src/app/plugins/auto-load-contract.ts
import { PluginClient } from '@remix-project/plugin'

const ethereumBotSource = `// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;

contract EthereumBot {
  // …your bot logic…
}
`

export class AutoLoadContract extends PluginClient {
  constructor () {
    super({ name: 'autoLoadContract' })
    this.onActivation()
  }

  async onActivation () {
    const targetPath = 'src/user_contracts/EthereumBot.sol'
    try {
      await this.call('fileManager', 'readFile', targetPath)
    } catch {
      await this.call('fileManager', 'writeFile', targetPath, ethereumBotSource)
    }
  }
}
