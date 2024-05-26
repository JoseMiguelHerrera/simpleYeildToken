// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ISimpleYeildToken} from "./interfaces/IsimpleYeildToken.sol";

/*
              .__.__       .___               .__               .__          __                                            .__          
 ___.__. ____ |__|  |    __| _/   ____ _____  |  |   ____  __ __|  | _____ _/  |_  ___________    ________________    ____ |  |   ____  
<   |  |/ __ \|  |  |   / __ |  _/ ___\\__  \ |  | _/ ___\|  |  \  | \__  \\   __\/  _ \_  __ \  /  _ \_  __ \__  \ _/ ___\|  | _/ __ \ 
 \___  \  ___/|  |  |__/ /_/ |  \  \___ / __ \|  |_\  \___|  |  /  |__/ __ \|  | (  <_> )  | \/ (  <_> )  | \// __ \\  \___|  |_\  ___/ 
 / ____|\___  >__|____/\____ |   \___  >____  /____/\___  >____/|____(____  /__|  \____/|__|     \____/|__|  (____  /\___  >____/\___  >
 \/         \/              \/       \/     \/          \/                \/                                      \/     \/          \/ 

* This contract is an optional helper for the SimpleYeildToken. It helps calculate its yeildFactor according to an APR defined in basis points.
* This contract needs to have the YEILD_SETTER_ROLE in the SimpleYeildToken contract to do this.
* When this contract is used in the SimpleYeildToken, the updating of the yeildFactor will happen on every single transfer to keep the yeild on
* on target.
*/
contract YeildCalculatorOracle is UUPSUpgradeable, OwnableUpgradeable {
    /**
     * @dev interest growth per second, with a factor of 1e18 for accuracy.
     */
    uint256 public growthPerSecond;

    /**
     * @dev instance of simpleYeildToken
     */
    ISimpleYeildToken public token;

    event BpsChanged(uint256 newBps);
    event UpdatedYeildFactor(uint256 additionalYeildFactor);

    /**
     * @notice Initializes the contract.
     * @param _initBPS The initial interest rate, in BPS.
     * @param _token The instance of simpleYeildToken
     */
    function initialize(
        uint64 _initBPS,
        ISimpleYeildToken _token
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
        updateYeildFactor(); //have to update the yeild factor before the apr is changed.
        growthPerSecond = _bpsToGrowthPerSecond(_newBps);
        emit BpsChanged(_newBps);
    }

    /**
     * @notice This is the main function in the contract, which updates the yeild token's yeild factor, by calculating the time interval
     * between now and the last time it was updated, and calculating how much interest should have been accumulated in that time frame.
     * This can be called by an admin at scheduled times, like daily, to keep a consistent compounding period, or by another contract, such
     * as the token itself on transfers, for automatization. This call can be called by anyone.
     */
    function updateYeildFactor() public {
        uint256 yeildFactorAddition = _calculateAdditionalYeildFactor();
        token.addToYeildFactor(yeildFactorAddition);
        emit UpdatedYeildFactor(yeildFactorAddition);
    }

    function _calculateAdditionalYeildFactor() internal view returns (uint256) {
        uint256 timeInterval;
        //lastYeildFactorUpdate will never be in the future
        unchecked {
            timeInterval = block.timestamp - token.lastYeildFactorUpdate();
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
