# Simple Yeild Accumulating Token & Yeild Calculator Oracle

## Description

This repo contains 2 contracts:
- SimpleYeildToken: An erc20-based contract that allows for yeild via a simple rebasing mechanism.
 Contract keeps track of "capital" that has entered the system, but also outputs balances that are yeild-adjusted via the yeildFactor variable.
- YeildCalculatorOracle: a contract that is an optional helper for the SimpleYeildToken. It helps calculate its yeildFactor according to an APR defined in basis points.

Deciding to use the YeildCalculatorOracle is a tradeoff between automatization and cost for users. The admin of these contracts may choose to update the yeild factor manually using an offchain server, making transactions cheaper for users. Or they may enable the use of the YeildCalculatorOracle, which offsets the cost to users, but makes the system automated and more decentralized.

## Requirements

This system was made with the following requirements:
- Admin can mint new tokens to users at any moment in time.
- Users of the token can hold, transfer, and burn tokens while continuously accruing interest on their existing balances.
- Rate (APY) is initially set by an admin of the token and is defined in [BPS](https://www.investopedia.com/terms/b/basispoint.asp).
- Admin is able to change the interest rate at any moment in time.
- Tokens must not be locked in any other contract, which means that these requirements cannot be achieved using aToken, cToken, or erc4626 interest earning vaults.

## Installation and Operations 


### Installation

To intall, ``` run npm i ``` .

### Operations

- To test contracts, run  ```npm run test ``` 
- To build contracts, run  ```npm run build ``` 
- To produce a gas usage report, use  ```npm run gasReport ``` 
- To produce a coverage report, use ```npm run coverage ```
- To product a lint report, use ```npm run lint ```