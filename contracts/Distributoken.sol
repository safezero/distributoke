pragma solidity ^0.4.4;

import "HumanStandardToken.sol";
import "Twofa.sol"; //github.com/safezero/eth-twofa

contract Distributoken is HumanStandardToken, Twofa {

    address public owner;

    struct Gift {
        uint256 timestamp;
        address receiever;
        uint256 value;
        bytes32 memo;
    }
    Gift[] public gifts;

    function Distributoken(string _name, string _symbol, bytes16 _hashedSecret, bytes4 checksum) Twofa(_hashedSecret, checksum){
      owner = msg.sender;
      name = _name;
      symbol = _symbol;
    }

    modifier onlyowner() {
      if (msg.sender != owner) {
        throw;
      }
      _;
    }

    function _gift (address _receiver, uint256 _value, bytes32 _memo) internal {
      gifts[gifts.length++] = Gift(now, _receiver, _value, _memo);
      balances[_receiver] += _value;
      totalSupply += _value;
    }

    function gift(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        address _receiver,
        uint256 _value,
        bytes32 _memo
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
      _gift(_receiver, _value, _memo);
    }

    function gift(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        address[] receivers,
        uint256[] values,
        bytes32[] memos
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
      for (uint i = 0; i < receivers.length; i++) {
        _gift(receivers[i], values[i], memos[i]);
      }
    }

    function setOwner(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        address _owner
    ) onlyowner() twofa(secret, _hashedSecret, checksum){
        owner = _owner;
    }

}
