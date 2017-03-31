#!/usr/bin/env node

const colors = require('colors')

logGreen('Starting distributoken cli. This may take a minute.')

const commander = require('commander')
const Ultralightbeam = require('ultralightbeam')
const Wallet = require('ethereumjs-wallet')
const fs = require('fs')
const Account = require('ethereum-account-amorph')
const Amorph = require('amorph')
const HttpProvider = require('web3/lib/web3/HttpProvider')
const distributokenInfo = require('../lib/info')
const inquirer = require('inquirer')
const amorphBase2048Plugin = require('amorph-base2048')
const amorphHexPlugin = require('amorph-hex')
const SolWrapper = require('ultralightbeam/lib/SolWrapper')
const SolDeployTransactionRequest = require('ultralightbeam/lib/SolDeployTransactionRequest')
const keccak256 = require('keccak256-amorph')
const _ = require('lodash')
const waterfall = require('promise-waterfall')
const passwordPrompt = require('muted-password-prompt')

Amorph.loadPlugin(amorphBase2048Plugin)
Amorph.loadPlugin(amorphHexPlugin)
Amorph.ready()

function logRed(message) {
  console.log(message.red)
}

function logGreen(message) {
  console.log(message.green)
}

commander
  .arguments('<rpcaddr> <walletpath>')
  .option('-f, --form', 'twofa form')
  .action(function (rpcaddr, walletpath) {

    const provider = new HttpProvider(rpcaddr)
    const form = commander.form ? commander.form : 'base2048.english'
    let walletfile
    try {
      walletfile = fs.readFileSync(walletpath, 'utf8')
    } catch(err) {
      logRed(`Could not open walletpath "${walletpath}"`)
      process.exit()
    }
    return passwordPrompt('Please enter your UTC passphrase: ', { method: 'hide' }).then((password) => {
      let wallet = Wallet.fromV3(walletfile, password, true)
      logGreen(`Account ${wallet.getAddress().toString('hex')} unlocked`)
      const account = new Account(new Amorph(wallet.getPrivateKey(), 'buffer'))
      const ultralightbeam = new Ultralightbeam(provider, {
        blockPollerInterval: 1000,
        defaultAccount: account,
        maxBlocksToWait: 10,
        gasCostHook: (gasCost) => {
          return inquirer.prompt([{
            name: 'continue',
            message: `That will cost ${gasCost.to('bignumber').div('1000000000000000000').toFixed(5)} ETH. Continue? (y/n)`
          }]).then((answers) => {
            if (answers.continue !== 'y' && answers.continue !== 'yes') {
              throw new Error('Transaction cancelled')
            }
          })
        }
      })
      return ultralightbeam.eth.getBlockNumber().then((blockNumber) => {
        logGreen(`Currently on block #${blockNumber.to('number')}`)
        return showMenu(ultralightbeam, form)
      })
    }).catch((err) => {
      logRed(err.message)
      process.exit()
    })
  })
  .parse(process.argv)

function showMenu(ultralightbeam, form) {
  return inquirer.prompt([{
    name: 'action',
    type: 'list',
    message: 'Choose an action:',
    choices: [
      { name: 'Deploy a new distributoken contract', value: 'deploy'},
      { name: 'Distribute on an existing contract', value: 'distribute'},
    ]
  }]).then((answers) => {
    switch(answers.action) {
      case 'deploy': return deploy(ultralightbeam, form); break;
      case 'distribute': return distribute(ultralightbeam, form); break;
    }
  }).catch((err) => {
    logRed(err.message)
    return showMenu(ultralightbeam, form)
  })
}

function deploy(ultralightbeam, form) {
  const questions = [
    { name: 'symbol', message: '1. Enter token symbol:' },
    { name: 'description', message: '2. Enter token description:' },
    { name: 'hashedSecret', message: `3. Enter a new hashed secret in ${form}:` },
    { name: 'checksum', message: `4. Enter the checksum in ${form}:` }
  ]
  return inquirer.prompt(questions).then(function (answers) {
    const symbol = new Amorph(answers.symbol, 'ascii')
    const description = new Amorph(answers.description, 'ascii')
    const hashedSecret = new Amorph(answers.hashedSecret, form)
    const checksum = new Amorph(answers.checksum, form)

    if (!keccak256(hashedSecret).as('array', (array) => {
      return array.slice(0, 4)
    }).equals(checksum)) {
      throw new Error('Checksum mismatch')
    }

    const transactionRequest = new SolDeployTransactionRequest(
      ultralightbeam, distributokenInfo.code, distributokenInfo.abi, [
        symbol,
        description,
        hashedSecret,
        checksum
      ]
    )
    const transactionMonitor = transactionRequest.send()
    return transactionMonitor.getTransactionHash().then((transactionHash) => {
      return monitorTransactionHash(transactionHash)
    }).then((interval) => {
      return transactionMonitor.getContractAddress().then((contractAddress) => {
        logGreen(`Deployed ${symbol.to('ascii')} to ${contractAddress.to('hex')}`)
      }).finally(() => {
        clearInterval(interval)
        return showMenu(ultralightbeam, form)
      })
    })
  })
}

function distribute(ultralightbeam, form) {
  const questions = [
    { name: 'contractAddress', message: '1. Enter token address in hex:' },
    { name: 'secret', message: `2. Enter the current secret in ${form}:` },
    { name: 'hashedSecret', message: `3. Enter a new hashed secret in ${form}:` },
    { name: 'checksum', message: `4. Enter the checksum in ${form}:` },
    { name: 'count', message: '5. Enter the number of distributes you would like to make:' },
  ]
  return inquirer.prompt(questions).then(function (answers) {
    const contractAddress = new Amorph(answers.contractAddress.replace('0x', ''), 'hex')
    const secret = new Amorph(answers.secret, form)
    const hashedSecret = new Amorph(answers.hashedSecret, form)
    const checksum = new Amorph(answers.checksum, form)
    const count = parseInt(answers.count)
    const distributoken = new SolWrapper(ultralightbeam, distributokenInfo.abi, contractAddress)

    if (count === 0 || isNaN(count)) {
      throw new Error('Distributions count must be integer')
    }

    if (!keccak256(hashedSecret).as('array', (array) => {
      return array.slice(0, 4)
    }).equals(checksum)) {
      throw new Error('Checksum mismatch')
    }

    console.log('Checking secret...')
    return distributoken.fetch('hashedSecret()', []).then((hashedSecret) => {
      if (keccak256(secret).as('array', (array) => { return array.slice(0, 16) }).equals(hashedSecret)) {
        logGreen('Secret is correct')
      } else {
        throw new Error(`Secret does not match current hashed secret: ${hashedSecret.to(form)}`)
      }
    }).then(() => {
      const receivers = []
      const values = []
      const memos = []

      const inquiryWrappers = _.range(count).map((index) => {
        return () => {
          return inquirer.prompt([
            {
              name: `receiver`,
              message: `5.${index + 1}.1 Enter the receiver's address in hex:`,
              validate: (receiver) => {
                if(receiver.replace('0x', '').length !== 40) {
                  return 'Receiver must be 40 characters'
                } else {
                  return true
                }
              }
            },
            {
              name: `value`,
              message: `5.${index + 1}.2 Enter the value of the distribute as an integer:`,
              validate: (value) => {
                if(isNaN(parseInt(value))) {
                  return 'Value must be an integer'
                } else {
                  return true
                }
              }
            },
            {
              name: `memo`,
              message: `5.${index + 1}.3 Enter a memo in ascii`,
              validate: (memo) => {
                if(memo.length > 32) {
                  return 'Memo must be less than 32 characters long'
                } else {
                  return true
                }
              }
            }
          ]).then((answers) => {
            receivers.push(new Amorph(answers.receiver.replace('0x', ''), 'hex'))
            values.push(new Amorph(parseInt(answers.value), 'number'))
            memos.push(new Amorph(answers.memo, 'ascii'))
          })
        }
      })
      return waterfall(inquiryWrappers).then(() => {
        const transactionMonitor = distributoken.broadcast('distribute(bytes16,bytes16,bytes4,address[],uint256[],bytes32[])', [
          secret, hashedSecret, checksum, receivers, values, memos
        ], {})
        return transactionMonitor.getTransactionHash().then((transactionHash) => {
          return monitorTransactionHash(transactionHash)
        }).then((interval) => {
          return transactionMonitor.getConfirmation().then(() => {
            logGreen(`Completed ${count} distributes`)
          }).finally(() => {
            clearInterval(interval)
            return showMenu(ultralightbeam, form)
          })
        })
      })
    })
  });
}

function monitorTransactionHash(transactionHash) {
  const start = new Date().getTime()
  return setInterval(() => {
    const now = new Date().getTime()
    const seconds = Math.round((now - start) / 1000)
    console.log(`Waited ${seconds} seconds for transaction ${transactionHash.to('hex.prefixed')}...`)
  }, 1000)
}
