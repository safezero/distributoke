const Ultralightbeam = require('ultralightbeam')
const TestRPC = require('ethereumjs-testrpc')
const Account = require('ethereum-account-amorph')
const SolDeployTransactionRequest = require('ultralightbeam/lib/SolDeployTransactionRequest')
const SolWrapper = require('ultralightbeam/lib/SolWrapper')
const _ = require('lodash')
const fs = require('fs')
const solc = require('solc')
const Amorph = require('amorph')
const Q = require('q')
const chai = require('chai')
const chaiAmorph = require('chai-amorph')
const chaiAsPromised = require('chai-as-promised')
const random = require('random-amorph')
const keccak256 = require('keccak256-amorph')
const waterfall = require('promise-waterfall')
const Twofa = require('eth-twofa')
const distributokenInfo = require('./lib/info')

chai.use(chaiAmorph)
chai.use(chaiAsPromised)
chai.should()

const account = Account.generate()
const provider = TestRPC.provider({
  gasLimit: 4000000,
  blocktime: 2,
  accounts: [{
    balance: 1000000000000000000,
    secretKey: account.privateKey.to('hex.prefixed')
  }],
  locked: false
})

const ultralightbeam = new Ultralightbeam(provider, {
  defaultAccount: account
})

const initialSupply = new Amorph(0, 'number')
const name = new Amorph('THANKS', 'ascii')
const decimals = new Amorph(0, 'number')
const symbol = new Amorph('THANKS description', 'ascii')

const receiversCount = 5
const receivers = _.range(receiversCount).map(() => { return Account.generate() })
const values = _.range(receiversCount).map(() => { return random(1) })
const memos = _.range(receiversCount).map(() => { return random(32) })
const twofas = _.range(receiversCount * 2 + 1).map(() => { return Twofa.generate( )})

describe('distributoken', () => {
  let distributoken

  it('should deploy', () => {
    return ultralightbeam.solDeploy(distributokenInfo.code, distributokenInfo.abi, [
      name,
      symbol,
      twofas[0].hashedSecret,
      twofas[0].checksum
    ]).then((_distributoken) => {
      distributoken = _distributoken
    })
  })

  it('should have correct values', () => {
    return Q.all([
      distributoken.fetch('owner()', []).should.eventually.amorphEqual(account.address),
      distributoken.fetch('totalSupply()', []).should.eventually.amorphEqual(initialSupply),
      distributoken.fetch('name()', []).should.eventually.amorphEqual(name),
      distributoken.fetch('decimals()', []).should.eventually.amorphEqual(decimals),
      distributoken.fetch('symbol()', []).should.eventually.amorphEqual(symbol),
      distributoken.fetch('balanceOf(address)', [account.address]).should.eventually.amorphEqual(initialSupply),
      distributoken.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[0].hashedSecret)
    ])
  })

  it(`make ${receiversCount} gifts`, () => {
    return waterfall(receivers.map((receiver, index) => {
      return () => {
        return distributoken.broadcast('gift(bytes16,bytes16,bytes4,address,uint256,bytes32)', [
          twofas[index].secret, twofas[index + 1].hashedSecret, twofas[index + 1].checksum,
          receiver.address, values[index], memos[index]
        ]).getConfirmation()
      }
    }))
  })

  it('should have correct hashedSecret', () => {
    return distributoken.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[receiversCount].hashedSecret)
  })

  it(`all ${receiversCount} gifts should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('gifts(uint256)', [new Amorph(index, 'number')]).then((gift) => {
        gift.timestamp.should.amorphTo('number').be.gt(0)
        gift.receiever.should.amorphEqual(receiver.address)
        gift.value.should.amorphEqual(values[index])
        gift.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 5th gift should be rejected', () => {
    return distributoken.fetch('gifts(uint256)', [new Amorph(5, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index])
    }))
  })

  it(`make ${receiversCount} more gifts (as a single transaction)`, () => {
    return distributoken.broadcast('gift(bytes16,bytes16,bytes4,address[],uint256[],bytes32[])', [
      twofas[receiversCount].secret, twofas[receiversCount + 1].hashedSecret, twofas[receiversCount + 1].checksum,
      _.map(receivers, 'address'), values, memos
    ]).getConfirmation()
  })

  it('should have correct hashedSecret', () => {
    return distributoken.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[receiversCount + 1].hashedSecret)
  })

  it(`all ${receiversCount} gifts should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('gifts(uint256)', [new Amorph(index + receiversCount, 'number')]).then((gift) => {
        gift.timestamp.should.amorphTo('number').be.gt(0)
        gift.receiever.should.amorphEqual(receiver.address)
        gift.value.should.amorphEqual(values[index])
        gift.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 20th gift should be rejected', () => {
    return distributoken.fetch('gifts(uint256)', [new Amorph(20, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index].as('bignumber', (bignumber) => {
        return bignumber.times(2)
      }))
    }))
  })

})
