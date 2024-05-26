// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface ISimpleYeildToken{
    function addToYeildFactor(uint256 _yeildFactorIncrement) external;
    function lastYeildFactorUpdate() external view returns(uint256) ;
}