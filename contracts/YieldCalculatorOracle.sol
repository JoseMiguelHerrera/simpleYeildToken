// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ISimpleYieldToken} from "./interfaces/IsimpleYieldToken.sol";

/*
_____.___.__       .__       .___ _________        .__               .__          __                 ________                      .__          
\__  |   |__| ____ |  |    __| _/ \_   ___ \_____  |  |   ____  __ __|  | _____ _/  |_  ___________  \_____  \____________    ____ |  |   ____  
 /   |   |  |/ __ \|  |   / __ |  /    \  \/\__  \ |  | _/ ___\|  |  \  | \__  \\   __\/  _ \_  __ \  /   |   \_  __ \__  \ _/ ___\|  | _/ __ \ 
 \____   |  \  ___/|  |__/ /_/ |  \     \____/ __ \|  |_\  \___|  |  /  |__/ __ \|  | (  <_> )  | \/ /    |    \  | \// __ \\  \___|  |_\  ___/ 
 / ______|__|\___  >____/\____ |   \______  (____  /____/\___  >____/|____(____  /__|  \____/|__|    \_______  /__|  (____  /\___  >____/\___  >
 \/              \/           \/          \/     \/          \/                \/                            \/           \/     \/          \/           \/              \/          \/     \/          \/                \/                            \/           \/     \/          \/ 
* This contract is an optional helper for the SimpleYieldToken. It helps calculate its yieldFactor according to an APR defined in basis points.
* This contract needs to have the YIELD_SETTER_ROLE in the SimpleYieldToken contract to do this.
* When this contract is used in the SimpleYieldToken, the updating of the yieldFactor will happen on every single transfer to keep the yield on
* on target.
*/
contract YieldCalculatorOracle is UUPSUpgradeable, OwnableUpgradeable {
    /**
     * @dev interest growth per second, with a factor of 1e18 for accuracy.
     */
    uint256 public growthPerSecond;

    /**
     * @dev instance of SimpleYieldToken
     */
    ISimpleYieldToken public token;

    event BpsChanged(uint256 newBps);
    event UpdatedYieldFactor(uint256 additionalYieldFactor);

    /**
     * @notice Initializes the contract.
     * @param _initBPS The initial interest rate, in BPS.
     * @param _token The instance of SimpleYieldToken
     */
    function initialize(
        uint64 _initBPS,
        ISimpleYieldToken _token
    ) external initializer {
        growthPerSecond = _bpsToGrowthPerSecond(_initBPS);
        token = _token;
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract.
     * @param _newBps The new interest rate, in BPS.
     */
    function changeBps(uint64 _newBps) public onlyOwner {
        updateYieldFactor(); // have to update the yield factor before the APR is changed.
        growthPerSecond = _bpsToGrowthPerSecond(_newBps);
        emit BpsChanged(_newBps);
    }

    /**
     * @notice This is the main function in the contract, which updates the yield token's yield factor, by calculating the time interval
     * between now and the last time it was updated, and calculating how much interest should have been accumulated in that time frame.
     * This can be called by an admin at scheduled times, like daily, to keep a consistent compounding period, or by another contract, such
     * as the token itself on transfers, for automatization. This call can be called by anyone.
     */
    function updateYieldFactor() public {
        uint256 yieldFactorAddition = _calculateAdditionalYieldFactor();
        token.addToYieldFactor(yieldFactorAddition);
        emit UpdatedYieldFactor(yieldFactorAddition);
    }

    function _calculateAdditionalYieldFactor() internal view returns (uint256) {
        uint256 timeInterval;
        // lastYieldFactorUpdate will never be in the future
        unchecked {
            timeInterval = block.timestamp - token.lastYieldFactorUpdate();
        }
        return growthPerSecond * timeInterval;
    }

    function _bpsToGrowthPerSecond(uint64 bps) internal pure returns (uint256) {
        uint256 secondsInYear = 365 * 60 * 60 * 24;
        // Percentage factor for precision
        uint256 percentageFactor = 1e18;
        uint256 bpsFactor = 10000;

        return (bps * percentageFactor) / (bpsFactor * secondsInYear);
    }

    /**
     * @dev Only owner can upgrade this contract.
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[42] private __gap;
}
