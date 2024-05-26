// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ISimpleYieldToken{
    function addToYieldFactor(uint256 _yieldFactorIncrement) external;
    function lastYieldFactorUpdate() external view returns(uint256);
}