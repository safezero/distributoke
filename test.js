const Ultralightbeam = require('ultralightbeam')
const TestRPC = require('ethereumjs-testrpc')
const Account = require('ethereum-account-amorph')
const SolDeployTransactionRequest = require('ultralightbeam/lib/SolDeployTransactionRequest')
const TransactionRequest = require('ultralightbeam/lib/TransactionRequest')
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
const OOGError = require('ultralightbeam/lib/errors/OOG')
const InvalidFunctionSignatureError = require('ultralightbeam/lib/errors/InvalidFunctionSignature')

chai.use(chaiAmorph)
chai.use(chaiAsPromised)
chai.should()

const owner = Account.generate()
const newOwner = Account.generate()

const initialSupply = new Amorph(0, 'number')
const name = new Amorph('THANKS', 'ascii')
const decimals = new Amorph(0, 'number')
const symbol = new Amorph('THANKS description', 'ascii')

const receiversCount = 5
const receivers = _.range(receiversCount).map(() => { return Account.generate() })
const values = _.range(receiversCount).map(() => { return random(1) })
const memos = _.range(receiversCount).map(() => { return random(32) })
const twofas = _.range(receiversCount * 2 + 1).map(() => { return Twofa.generate( )})

const provider = TestRPC.provider({
  gasLimit: 4000000,
  blocktime: 2,
  accounts: [{
    balance: 1000000000000000000,
    secretKey: owner.privateKey.to('hex.prefixed')
  }, {
    balance: 1000000000000000000,
    secretKey: newOwner.privateKey.to('hex.prefixed')
  }].concat(receivers.map((receiver) => {
    return {
      balance: 1000000000000000000,
      secretKey: receiver.privateKey.to('hex.prefixed')
    }
  })),
  locked: false
})

const ultralightbeam = new Ultralightbeam(provider, {
  maxBlocksToWait: 10,
  defaultAccount: owner,
  gasMultiplier: 1.5
})

describe('distributoken', () => {
  let distributoken

  before((done) => {
    setTimeout(done, 2000)
  })

  it('should deploy', () => {
    return ultralightbeam.solDeploy(distributokenInfo.code, distributokenInfo.abi, [
      name,
      symbol,
      twofas[0].hashedSecret,
      twofas[0].checksum
    ], {}).then((_distributoken) => {
      distributoken = _distributoken
    })
  })

  it('should have correct values', () => {
    return Q.all([
      distributoken.fetch('owner()', []).should.eventually.amorphEqual(owner.address),
      distributoken.fetch('totalSupply()', []).should.eventually.amorphEqual(initialSupply),
      distributoken.fetch('name()', []).should.eventually.amorphEqual(name),
      distributoken.fetch('decimals()', []).should.eventually.amorphEqual(decimals),
      distributoken.fetch('symbol()', []).should.eventually.amorphEqual(symbol),
      distributoken.fetch('balanceOf(address)', [owner.address]).should.eventually.amorphEqual(initialSupply),
      distributoken.fetch('hashedSecret()', []).should.eventually.amorphEqual(twofas[0].hashedSecret)
    ])
  })

  it('should NOT be able to call _distribute', () => {
    (() => {
      distributoken.broadcast('_distribute(address,uint256,bytes32)', [
        owner.address, new Amorph(1, 'number'), new Amorph('hello', 'ascii')
      ], {})
    }).should.throw(InvalidFunctionSignatureError)
  })

  it(`should NOT be able to distribute from non-owner`, () => {
    return waterfall(receivers.map((receiver, index) => {
      return () => {
        return distributoken.broadcast('distribute(bytes16,bytes16,bytes4,address,uint256,bytes32)', [
          twofas[index].secret, twofas[index + 1].hashedSecret, twofas[index + 1].checksum,
          receiver.address, values[index], memos[index]
        ], {
          from: receiver
        }).getConfirmation().should.be.rejectedWith(Error)
      }
    }))
  })

  it(`make ${receiversCount} distributions`, () => {
    return waterfall(receivers.map((receiver, index) => {
      return () => {
        return distributoken.broadcast('distribute(bytes16,bytes16,bytes4,address,uint256,bytes32)', [
          twofas[index].secret, twofas[index + 1].hashedSecret, twofas[index + 1].checksum,
          receiver.address, values[index], memos[index]
        ], {}).getConfirmation()
      }
    }))
  })

  it('should have correct hashedSecret', () => {
    return distributoken.fetch('hashedSecret()', []).should.eventually.amorphEqual(twofas[receiversCount].hashedSecret)
  })

  it(`all ${receiversCount} distributions should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('distributions(uint256)', [new Amorph(index, 'number')]).then((distribution) => {
        distribution.timestamp.should.amorphTo('number').be.gt(0)
        distribution.receiever.should.amorphEqual(receiver.address)
        distribution.value.should.amorphEqual(values[index])
        distribution.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 5th distribution should be rejected', () => {
    return distributoken.fetch('distributions(uint256)', [new Amorph(5, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index])
    }))
  })

  it(`make ${receiversCount} more distributions (as a single transaction)`, () => {
    return distributoken.broadcast('distribute(bytes16,bytes16,bytes4,address[],uint256[],bytes32[])', [
      twofas[receiversCount].secret, twofas[receiversCount + 1].hashedSecret, twofas[receiversCount + 1].checksum,
      _.map(receivers, 'address'), values, memos
    ], {}).getConfirmation()
  })

  it('should have correct hashedSecret', () => {
    return distributoken.fetch('hashedSecret()', []).should.eventually.amorphEqual(twofas[receiversCount + 1].hashedSecret)
  })

  it(`all ${receiversCount} distributions should have correct values`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('distributions(uint256)', [new Amorph(index + receiversCount, 'number')]).then((distribution) => {
        distribution.timestamp.should.amorphTo('number').be.gt(0)
        distribution.receiever.should.amorphEqual(receiver.address)
        distribution.value.should.amorphEqual(values[index])
        distribution.memo.should.amorphEqual(memos[index])
      })
    }))
  })

  it('fetching the 20th distribution should be rejected', () => {
    return distributoken.fetch('distributions(uint256)', [new Amorph(20, 'number')]).should.be.rejectedWith(Error)
  })

  it(`all ${receiversCount} receivers should have correct balance`, () => {
    return Q.all(receivers.map((receiver, index) => {
      return distributoken.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index].as('bignumber', (bignumber) => {
        return bignumber.times(2)
      }))
    }))
  })

  it(`should be NOT able to change the owner from non-owner`, () => {
    return distributoken.broadcast('setOwner(bytes16,bytes16,bytes4,address)', [
      twofas[receiversCount + 1].secret, twofas[receiversCount + 2].hashedSecret, twofas[receiversCount + 2].checksum,
      newOwner.address
    ], {
      from: newOwner
    }).getConfirmation().should.be.rejectedWith(Error)
  })

  it(`should be able to change the owner`, () => {
    return distributoken.broadcast('setOwner(bytes16,bytes16,bytes4,address)', [
      twofas[receiversCount + 1].secret, twofas[receiversCount + 2].hashedSecret, twofas[receiversCount + 2].checksum,
      newOwner.address
    ], {}).getConfirmation()
  })

  it(`should have updated owner`, () => {
    return distributoken.fetch('owner()', []).should.eventually.amorphEqual(newOwner.address)
  })

  it(`should sunset`, () => {
    return distributoken.broadcast('setSunset(bytes16,bytes16,bytes4,uint256)', [
      twofas[receiversCount + 2].secret, twofas[receiversCount + 3].hashedSecret, twofas[receiversCount + 3].checksum,
      new Amorph(1, 'number')
    ], {
      from: newOwner
    }).getConfirmation()
  })

  it(`should have updated sunset`, () => {
    return distributoken.fetch('sunset()', []).should.eventually.amorphEqual(new Amorph(1, 'number'))
  })

  it('should not be able to transfer', () => {
    return distributoken.broadcast('transfer(address,uint256)', [
      receivers[1].address, values[0]
    ], {
      from: receivers[0]
    }).getConfirmation().should.be.rejectedWith(Error)
  })

  it(`should un-sunset`, () => {
    return distributoken.broadcast('setSunset(bytes16,bytes16,bytes4,uint256)', [
      twofas[receiversCount + 3].secret, twofas[receiversCount + 4].hashedSecret, twofas[receiversCount + 4].checksum,
      new Amorph(0, 'number')
    ], {
      from: newOwner,
      gas: ultralightbeam.blockPoller.block.gasLimit
    }).getConfirmation()
  })

  it(`should have updated sunset`, () => {
    return distributoken.fetch('sunset()', []).should.eventually.amorphEqual(new Amorph(0, 'number'))
  })

  describe('StandardToken', () => {
    describe('transfer', () => {
      it('should fail when value > balance', () => {
        distributoken.broadcast('transfer(address,uint256)', [
          receivers[1].address,
          values[0].as('bignumber', (bignumber) => {
            return bignumber.times(3)
          })
        ], {
          from: receivers[0]
        }).getConfirmation().should.eventually.be.rejectedWith(Error)
      })
      it('receivers values should be the same', () => {
        return Q.all(receivers.map((receiver, index) => {
          return distributoken.fetch('balanceOf(address)', [receiver.address]).should.eventually.amorphEqual(values[index].as('bignumber', (bignumber) => {
            return bignumber.times(2)
          }))
        }))
      })
      it('should succeed', () => {
        return distributoken.broadcast('transfer(address,uint256)', [
          receivers[1].address, values[0]
        ], {
          from: receivers[0]
        }).getConfirmation()
      })
      it('should have updated balances', () => {
        return Q.all([
          distributoken.fetch('balanceOf(address)', [receivers[0].address]).should.eventually.amorphEqual(values[0], 'number'),
          distributoken.fetch('balanceOf(address)', [receivers[1].address]).should.eventually.amorphEqual(values[1].as('bignumber', (bignumber) => {
            return bignumber.times(2).plus(values[0].to('bignumber'))
          }))
        ])
      })
    })
    describe('transferFrom', () => {
      it('attempt to transferFrom receivers[1] to receivers[0] from owner', () => {
        return distributoken.broadcast('transferFrom(address,address,uint256)', [
          receivers[1].address, receivers[0].address, values[0]
        ], {
          from: owner
        }).getConfirmation()
      })
      it('should NOT have updated balances', () => {
        return Q.all([
          distributoken.fetch('balanceOf(address)', [receivers[0].address]).should.eventually.amorphEqual(values[0], 'number'),
          distributoken.fetch('balanceOf(address)', [receivers[1].address]).should.eventually.amorphEqual(values[1].as('bignumber', (bignumber) => {
            return bignumber.times(2).plus(values[0].to('bignumber'))
          }))
        ])
      })
      it('should approve owner (as receivers[1])', () => {
        return distributoken.broadcast('approve(address,uint256)', [
          owner.address, values[0]
        ], {
          from: receivers[1]
        }).getConfirmation()
      })
      it('should have updated allowance', () => {
        return distributoken.fetch('allowance(address,address)', [
          receivers[1].address, owner.address
        ]).should.eventually.amorphEqual(values[0])
      })
      it('owner should transferFrom receivers[1] to receivers[0] from owner', () => {
        return distributoken.broadcast('transferFrom(address,address,uint256)', [
          receivers[1].address, receivers[0].address, values[0]
        ], {
          from: owner,
          gas: ultralightbeam.blockPoller.block.gasLimit
        }).getConfirmation()
      })
      it('should have updated balances', () => {
        return Q.all([
          distributoken.fetch('balanceOf(address)', [receivers[0].address]).should.eventually.amorphEqual(values[0].as('bignumber', (bignumber) => {
            return bignumber.times(2)
          })),
          distributoken.fetch('balanceOf(address)', [receivers[1].address]).should.eventually.amorphEqual(values[1].as('bignumber', (bignumber) => {
            return bignumber.times(2)
          }))
        ])
      })
    })
  })
  describe('HumanStandardToken', () => {
    it('fallback should throw an error', () => {
      return new TransactionRequest(ultralightbeam, {
        to: distributoken.address,
        value: new Amorph(1, 'number')
      }).send().getConfirmation().should.eventually.be.rejectedWith(Error)
    })
  })

})
