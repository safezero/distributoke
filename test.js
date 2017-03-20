const Ultralightbeam = require('ultralightbeam')
const TestRPC = require('ethereumjs-testrpc')
const Account = require('ethereum-account-amorph')
const SolDeployTransactionRequest = require('ultralightbeam/lib/SolDeployTransactionRequest')
const SolWrapper = require('ultralightbeam/lib/SolWrapper')
const _ = require('lodash')
const fs = require('fs')
const solc = require('solc')
const Amorph = require('amorph')
const amorphParseSolcOuput = require('amorph-parse-solc-output')
const Q = require('q')
const chai = require('chai')
const chaiAmorph = require('chai-amorph')
const chaiAsPromised = require('chai-as-promised')
const random = require('random-amorph')
const keccak256 = require('keccak256-amorph')
const waterfall = require('promise-waterfall')
const Twofa = require('eth-twofa')

chai.use(chaiAmorph)
chai.use(chaiAsPromised)
chai.should()

const owner = Account.generate()
const provider = TestRPC.provider({
  gasLimit: 4000000,
  blocktime: 2,
  accounts: [{
    balance: 1000000000,
    secretKey: owner.privateKey.to('hex.prefixed')
  }],
  locked: false
})

const ultralightbeam = new Ultralightbeam(provider, {})

const initialSupply = new Amorph(0, 'number')
const name = new Amorph('THANKS', 'ascii')
const decimals = new Amorph(0, 'number')
const symbol = new Amorph('THANKS', 'ascii')

const receiversCount = 5
const receivers = _.range(receiversCount).map(() => { return Account.generate() })
const values = _.range(receiversCount).map(() => { return random(1) })
const memos = _.range(receiversCount).map(() => { return random(32) })
const twofas = _.range(receiversCount * 2 + 1).map(() => { return Twofa.generate( )})

describe('thanks', () => {
  let thanksInfo
  let thanks

  it('should compile', () => {
    const solcOutput = solc.compile({
      sources: {
        'Thanks.sol': fs.readFileSync('./contracts/Thanks.sol', 'utf8'),
        'Twofa.sol': fs.readFileSync('./node_modules/eth-twofa/Twofa.sol', 'utf8'),
        'HumanStandardToken.sol': fs.readFileSync('./contracts/HumanStandardToken.sol', 'utf8'),
        'StandardToken.sol': fs.readFileSync('./contracts/StandardToken.sol', 'utf8'),
        'Token.sol': fs.readFileSync('./contracts/Token.sol', 'utf8')
      }
    })
    thanksInfo = amorphParseSolcOuput(solcOutput, Amorph)['Thanks.sol:Thanks']
  })

  it('should deploy', () => {
    const transactionRequest = new SolDeployTransactionRequest(
      thanksInfo.code, thanksInfo.abi, [
        twofas[0].hashedSecret,
        twofas[0].checksum
      ], {
        from: owner
      }
    )
    return ultralightbeam
      .sendTransaction(transactionRequest)
      .getTransactionReceipt().then((transactionReceipt) => {
        thanks = new SolWrapper(
          ultralightbeam, thanksInfo.abi, transactionReceipt.contractAddress
        )
      })
  })

  it('should have correct values', () => {
    return Q.all([
      thanks.fetch('owner()', []).should.eventually.amorphEqual(owner.address),
      thanks.fetch('totalSupply()', []).should.eventually.amorphEqual(initialSupply),
      thanks.fetch('name()', []).should.eventually.amorphEqual(name),
      thanks.fetch('decimals()', []).should.eventually.amorphEqual(decimals),
      thanks.fetch('symbol()', []).should.eventually.amorphEqual(symbol),
      thanks.fetch('balanceOf(address)', [owner.address]).should.eventually.amorphEqual(initialSupply),
      thanks.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[0].hashedSecret)
    ])
  })

  it(`make ${receiversCount} gifts`, () => {
    return waterfall(receivers.map((receiver, index) => {
      return () => {
        return thanks.broadcast('gift(bytes32,bytes32,bytes4,address,uint256,bytes32)', [
          twofas[index].secret, twofas[index + 1].hashedSecret, twofas[index + 1].checksum,
          receiver.address, values[index], memos[index]
        ], {
          from: owner
        }).getConfirmation()
      }
    }))
  })

  it('should have correct hashedSecret', () => {
    return thanks.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[receiversCount].hashedSecret)
  })

  it(`all ${receiversCount} gifts should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return thanks.fetch('gifts(uint256)', [new Amorph(index, 'number')]).then((gift) => {
        gift.timestamp.should.amorphTo('number').be.gt(0)
        gift.receiever.should.amorphEqual(receiver.address)
        gift.value.should.amorphEqual(values[index])
        gift.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 5th gift should be rejected', () => {
    return thanks.fetch('gifts(uint256)', [new Amorph(5, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return thanks.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index])
    }))
  })

  it(`make ${receiversCount} more gifts`, () => {
    return waterfall(receivers.map((receiver, index) => {
      return () => {
        return thanks.broadcast('gift(bytes32,bytes32,bytes4,address,uint256,bytes32)', [
          twofas[index + receiversCount].secret, twofas[index + receiversCount + 1].hashedSecret, twofas[index + receiversCount + 1].checksum,
          receiver.address, values[index], memos[index]
        ], {
          from: owner
        }).getConfirmation()
      }
    }))
  })

  it('should have correct hashedSecret', () => {
    return thanks.fetch('hashedSecret()').should.eventually.amorphEqual(twofas[receiversCount * 2].hashedSecret)
  })

  it(`all ${receiversCount} gifts should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return thanks.fetch('gifts(uint256)', [new Amorph(index + receiversCount, 'number')]).then((gift) => {
        gift.timestamp.should.amorphTo('number').be.gt(0)
        gift.receiever.should.amorphEqual(receiver.address)
        gift.value.should.amorphEqual(values[index])
        gift.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 20th gift should be rejected', () => {
    return thanks.fetch('gifts(uint256)', [new Amorph(20, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return thanks.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index].as('bignumber', (bignumber) => {
        return bignumber.times(2)
      }))
    }))
  })

})
