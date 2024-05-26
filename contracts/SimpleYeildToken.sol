// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IYeildCalculatorOracle} from "./interfaces/IyeildCalculatorOracle.sol";

/*
       .__               .__                         .__.__       .___   __          __                  
  _____|__| _____ ______ |  |   ____    ___.__. ____ |__|  |    __| _/ _/  |_  ____ |  | __ ____   ____  
 /  ___/  |/     \\____ \|  | _/ __ \  <   |  |/ __ \|  |  |   / __ |  \   __\/  _ \|  |/ // __ \ /    \ 
 \___ \|  |  Y Y  \  |_> >  |_\  ___/   \___  \  ___/|  |  |__/ /_/ |   |  | (  <_> )    <\  ___/|   |  \
/____  >__|__|_|  /   __/|____/\___  >  / ____|\___  >__|____/\____ |   |__|  \____/|__|_ \\___  >___|  /
     \/         \/|__|             \/   \/         \/              \/                    \/    \/     \/ 

* An erc20-based contract that allows for yeild via a simple rebasing mechanism.
* Contract keeps track of "capital" that has entered the system, but also outputs balances that are yeild-adjusted via the yeildFactor variable.
*
* The yeildFactor varaible needs to be updated either manually, or with an instance of YeildCalculatorOracle. If one desires a regular compounding
* period, like daily, yeildFactor will need to be updated by an off-chain server. YeildCalculatorOracle updates the yeildFactor on any token transfer,
* keeping it tied to a target APY.
*/

contract SimpleYeildToken is
    IERC20MetadataUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // Token name
    string private _name;
    // Token Symbol
    string private _symbol;
    // Total capital
    uint256 private _totalCapital;
    // Percentage factor for precision
    uint256 private constant _PERCENTAGE_FACTOR = 1e18;
    /**
     * @dev yeildFactor for yeild calculation logic.
     * The value is represented with 18 decimal places for precision.
     */
    uint256 public yeildFactor;

    /**
     * @dev timestamp of the last update of the yeildFactor. Helps with tracking an APY.
    */
    uint256 public lastYeildFactorUpdate;
    /**
     * @dev instance of an optional YeildCalculatorOracle for keeping yeildFactor updated automatically. 
    */
    IYeildCalculatorOracle public optionalYeildCalculatorOracle;

    // Mapping of capital per address
    mapping(address => uint256) private _capitalPerUser;

    // Mapping of allowances per owner and spender
    mapping(address => mapping(address => uint256)) private _allowances;

    // Access control roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant YEILD_SETTER_ROLE = keccak256("YEILD_SETTER_ROLE");

    // Events
    event YeildFactorSet(uint256 indexed value);

    /**
     * Standard ERC20 Errors
     * @dev See https://eips.ethereum.org/EIPS/eip-6093
     */
    error ERC20InsufficientBalance(
        address sender,
        uint256 capital,
        uint256 capitalNeeded
    );
    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);
    error ERC20InsufficientAllowance(
        address spender,
        uint256 allowance,
        uint256 needed
    );
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);

    // Custom Errors
    error InvalidMintReceiver(address receiver);
    error InvalidBurnSender(address sender);
    error InsufficientBurnBalance(
        address sender,
        uint256 capital,
        uint256 capitalNeeded
    );
    error InvalidYeildFactor(uint256);

    /**
     * @notice Initializes the contract.
     * @param name_ The name of the token.
     * @param symbol_ The symbol of the token.
     * @param owner Owner address.
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner
    ) external initializer {
        _name = name_;
        _symbol = symbol_;
        _setYieldFactor(_PERCENTAGE_FACTOR);

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, owner);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Moves tokens from an address to another one using the allowance mechanism.
     * @dev See {IERC20-transferFrom}.
     *
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. This allows applications to reconstruct the allowance
     * for all accounts just by listening to said events.
     *
     * Note: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least `amount`.
     * @param from The address from which tokens will be transferred.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        address spender = _msgSender();

        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);

        return true;
    }

    /**
     * @notice Increases the allowance granted to spender by the caller.
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * @param spender The address which will spend the funds.
     * @param addedValue The amount of tokens to increase the allowance by.
     */
    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) external returns (bool) {
        address owner = _msgSender();

        _approve(owner, spender, allowance(owner, spender) + addedValue);

        return true;
    }

    /**
     * @notice Decreases the allowance granted to spender by the caller.
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     * @param spender The address which will spend the funds.
     * @param subtractedValue The amount of tokens to decrease the allowance by.
     */
    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) external returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);

        if (currentAllowance < subtractedValue) {
            revert ERC20InsufficientAllowance(
                spender,
                currentAllowance,
                subtractedValue
            );
        }

        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }


    /**
     * @notice Approves an allowance for a spender.
     * @dev See {IERC20-approve}.
     *
     * Note: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        address owner = _msgSender();

        _approve(owner, spender, amount);

        return true;
    }

    /**
     * @notice Transfers a specified number of tokens from the caller's address to the recipient.
     * @dev See {_transfer}.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     * @return A boolean value indicating whether the operation succeeded.
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        address owner = _msgSender();

        _transfer(owner, to, amount);

        return true;
    }

    /**
     * @notice Destroys a specified amount of tokens from the given address.
     * @dev See {_burn}.
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @notice Creates new tokens to the specified address.
     * @dev See {_mint}.
     * @param to The address to mint the tokens to.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Sets the yeild factor.
     * @dev This function can only be called by DEFAULT_ADMIN_ROLE.
     * @param _yeildFactor The new yeild factor.
     */
    function setYeildFactor(
        uint256 _yeildFactor
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setYieldFactor(_yeildFactor);
    }

    /**
     * @notice Sets an automatic yeild calculator oracle for automated updates of the yeild factor.
     * @dev This function can only be called by DEFAULT_ADMIN_ROLE.
     * @param _yeildCalculatorOracle The yeild calculator oracle.
     */
    function setOptionalYeildOracle(
        IYeildCalculatorOracle _yeildCalculatorOracle
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        optionalYeildCalculatorOracle = _yeildCalculatorOracle;
    }

    /**
     * @notice Adds the given amount to the current yeild factor.
     * @dev This function can only be called by an account with YEILD_SETTER_ROLE.
     * @param _yeildFactorIncrement The amount to add to the current yeild factor
     */
    function addToYeildFactor(
        uint256 _yeildFactorIncrement
    ) external onlyRole(YEILD_SETTER_ROLE) {
        if (_yeildFactorIncrement == 0) {
            revert InvalidYeildFactor(_yeildFactorIncrement);
        }

        _setYieldFactor(yeildFactor + _yeildFactorIncrement);
    }

    /**
     * @notice Returns the name of the token.
     * @return A string representing the token's name.
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the symbol of the token.
     * @return A string representing the token's symbol.
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the balance of the specified address.
     * @dev Balances are dynamic and tied the `account`'s capital + yeild
     * @param account The address to query the balance of.
     * @return The balance of the specified address.
     */
    function balanceOf(address account) external view returns (uint256) {
        return convertToTokens(capitalOf(account));
    }

    /**
     * @notice Returns the total amount of capital.
     * @return The total amount of capital.
     */
    function totalCapital() external view returns (uint256) {
        return _totalCapital;
    }

    /**
     * @notice Returns the total supply of tokens.
     * @return The total supply of tokens.
     */
    function totalSupply() external view returns (uint256) {
        return convertToTokens(_totalCapital);
    }

    /**
     * @notice Returns the number of decimals the token uses.
     * @return The number of decimals (18)
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /**
     * @notice Converts an amount of tokens to capital.
     * @param amount The amount of tokens to convert.
     * @return The equivalent amount of capital.
     *
     */
    function convertToCapital(uint256 amount) public view returns (uint256) {
        return (amount * _PERCENTAGE_FACTOR) / yeildFactor;
    }

    /**
     * @notice Converts an amount of capital to tokens.
     * @param capital The amount of capital to convert.
     * @return The equivalent amount of tokens.
     */
    function convertToTokens(uint256 capital) public view returns (uint256) {
        return (capital * yeildFactor) / _PERCENTAGE_FACTOR;
    }

    /**
     * @notice Returns the amount of capital owned by the account.
     * @param account The account to check.
     * @return The amount of capital owned by the account.
     */
    function capitalOf(address account) public view returns (uint256) {
        return _capitalPerUser[account];
    }

    /**
     * @notice Returns the remaining amount of tokens that `spender` is allowed to spend on behalf of `owner`.
     * @dev See {IERC20-allowance}.
     * @param owner The address of the token owner.
     * @param spender The address of the spender.
     * @return The remaining allowance of the spender on behalf of the owner.
     */
    function allowance(
        address owner,
        address spender
    ) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev Ensures that only accounts with DEFAULT_ADMIN_ROLE can upgrade the contract.
     */
    function _authorizeUpgrade(
        address
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /**
     * @dev Private function that mints a specified number of tokens to the given address.
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * @param to The address to which tokens will be minted.
     * @param amount The number of tokens to mint.
     *
     */
    function _mint(address to, uint256 amount) private {
        if (to == address(0)) {
            revert InvalidMintReceiver(to);
        }

        _beforeTokenTransfer();

        uint256 capital = convertToCapital(amount);
        _totalCapital += capital;

        unchecked {
            // Overflow not possible: capital + capital amount is at most totalCapital + capital amount
            // which is checked above.
            _capitalPerUser[to] += capital;
        }

        _afterTokenTransfer(address(0), to, amount);
    }

    /**
     * @dev Private function that burns `amount` tokens from `account`, reducing the total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * @param account The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     *
     */
    function _burn(address account, uint256 amount) private {
        if (account == address(0)) {
            revert InvalidBurnSender(account);
        }

        _beforeTokenTransfer();

        uint256 capital = convertToCapital(amount);
        uint256 accountCapital = capitalOf(account);

        if (accountCapital < capital) {
            revert InsufficientBurnBalance(account, accountCapital, capital);
        }

        unchecked {
            _capitalPerUser[account] = accountCapital - capital;
            // Underflow not possible: amount <= accountCapital <= totalCapital.
            _totalCapital -= capital;
        }

        _afterTokenTransfer(account, address(0), amount);
    }

    /**
     * @dev Private funciton of a hook that is called after any transfer of tokens. This includes
     * minting and burning.
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) private {
        emit Transfer(from, to, amount);
    }

    /**
     * @dev Private function that transfers a specified number of tokens from one address to another.
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     * @param from The address from which tokens will be transferred.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     */
    function _transfer(address from, address to, uint256 amount) private {
        if (from == address(0)) {
            revert ERC20InvalidSender(from);
        }
        if (to == address(0)) {
            revert ERC20InvalidReceiver(to);
        }

        _beforeTokenTransfer();

        uint256 capital = convertToCapital(amount);
        uint256 fromCapital = _capitalPerUser[from];

        if (fromCapital < capital) {
            revert ERC20InsufficientBalance(from, fromCapital, capital);
        }

        unchecked {
            _capitalPerUser[from] = fromCapital - capital;
            // Overflow not possible: the sum of all capital is capped by totalCapital, and the sum is preserved by
            // decrementing then incrementing.
            _capitalPerUser[to] += capital;
        }

        _afterTokenTransfer(from, to, amount);
    }

    /**
     * @dev Private function to set the yeild factor.
     * @param _yeildFactor The new yeild factor.
     */
    function _setYieldFactor(uint256 _yeildFactor) private {
        if (_yeildFactor < _PERCENTAGE_FACTOR) {
            revert InvalidYeildFactor(_yeildFactor);
        }

        yeildFactor = _yeildFactor;
        lastYeildFactorUpdate = block.timestamp;

        emit YeildFactorSet(yeildFactor);
    }

    /**
     * @dev Private function to set `amount` as the allowance of `spender` over the `owner`s tokens.
     *
     * This function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     *
     */
    function _approve(address owner, address spender, uint256 amount) private {
        if (owner == address(0)) {
            revert ERC20InvalidApprover(owner);
        }
        if (spender == address(0)) {
            revert ERC20InvalidSpender(spender);
        }

        _allowances[owner][spender] = amount;

        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Private function that updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) private {
        uint256 currentAllowance = allowance(owner, spender);

        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) {
                revert ERC20InsufficientAllowance(
                    spender,
                    currentAllowance,
                    amount
                );
            }

            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev Private function that updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _beforeTokenTransfer() private {
        if (address(optionalYeildCalculatorOracle) != address(0)) {
            //If we're choosing to use the automatic yeild calculator, lets update the yeild factor on every transfer to keep it up to date.
            optionalYeildCalculatorOracle.updateYeildFactor();
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[42] private __gap;
}
