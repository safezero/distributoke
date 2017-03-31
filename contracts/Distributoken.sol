pragma solidity ^0.4.4;

import "HumanStandardToken.sol";
import "Twofa.sol"; //github.com/safezero/eth-twofa
import "Sunsets.sol";

contract Distributoken is HumanStandardToken, Twofa, Sunsets {

    address public owner;

    struct Distribution {
        uint256 timestamp;
        address receiever;
        uint256 value;
        bytes32 memo;
    }
    Distribution[] public distributions;

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

    function _distribute (address _receiver, uint256 _value, bytes32 _memo) internal {
      distributions[distributions.length++] = Distribution(now, _receiver, _value, _memo);
      balances[_receiver] += _value;
      totalSupply += _value;
    }

    function distribute(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        address _receiver,
        uint256 _value,
        bytes32 _memo
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
      _distribute(_receiver, _value, _memo);
    }

    function distribute(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        address[] receivers,
        uint256[] values,
        bytes32[] memos
    ) onlyowner() twofa(secret, _hashedSecret, checksum) {
      for (uint i = 0; i < receivers.length; i++) {
        _distribute(receivers[i], values[i], memos[i]);
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

    function setSunset(
        bytes16 secret,
        bytes16 _hashedSecret,
        bytes4 checksum,
        uint256 _sunset
    ) onlyowner() twofa(secret, _hashedSecret, checksum){
        sunset = _sunset;
    }

    function transfer(address _to, uint256 _value) sunsets() returns (bool success){
      return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint256 _value) sunsets() returns (bool success){
      return super.transferFrom(_from, _to, _value);
    }

}
