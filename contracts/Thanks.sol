pragma solidity ^0.4.4;

import "HumanStandardToken.sol";
import "Twofa.sol"; //github.com/safezero/eth-twofa

contract Thanks is HumanStandardToken, Twofa {

    address public owner;

    struct Gift {
        uint256 timestamp;
        address receiever;
        uint256 value;
        bytes32 memo;
    }
    Gift[] public gifts;

    function Thanks(bytes32 _hashedSecret, bytes4 checksum) Twofa(_hashedSecret, checksum){
      owner = msg.sender;
      name = "THANKS";
      symbol = "THANKS";
    }

    modifier onlyowner() {
      if (msg.sender != owner) {
        throw;
      }
      _;
    }

    function gift(
        bytes32 secret,
        bytes32 _hashedSecret,
        bytes4 checksum,
        address _receiver,
        uint256 _value,
        bytes32 _memo
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
        gifts[gifts.length++] = Gift(now, _receiver, _value, _memo);
        balances[_receiver] += _value;
        totalSupply += _value;
    }

    function setOwner(
        bytes32 secret,
        bytes32 _hashedSecret,
        bytes4 checksum,
        address _owner
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
        owner = _owner;
    }

}
