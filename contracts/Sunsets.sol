pragma solidity ^0.4.4;

contract Sunsets {
  uint256 public sunset;

  event Sunset(uint256 sunset);

  modifier sunsets() {
    if (sunset > 0) {
      Sunset(sunset);
      if (sunset < now) {
        throw;
      }
    }
    _;
  }
}
