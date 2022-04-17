// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

contract Mock {
    error ZeroValue();

    uint256 public s_total;
    mapping(address => uint256) public s_userNumber;

    modifier NonZeroValue(uint256 _val) {
        if (_val == 0) revert ZeroValue();
        _;
    }

    function add(uint256 _num) external NonZeroValue(_num) {
        s_userNumber[msg.sender] += _num;
        s_total += _num;
    }

    function sub(uint256 _num) external NonZeroValue(_num) {
        s_userNumber[msg.sender] -= _num;
        s_total -= _num;
    }
}
