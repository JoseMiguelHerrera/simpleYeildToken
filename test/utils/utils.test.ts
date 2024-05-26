const PERCENTAGE_FACTOR: bigint = BigInt("1000000000000000000");
const SECONDS_IN_A_YEAR = BigInt(365 * 60 * 60 * 24);

export function convertToCapital(tokenAmount: bigint, atYieldFactor: bigint) {
    return BigInt((tokenAmount * PERCENTAGE_FACTOR) / atYieldFactor);
}

export function convertToTokens(capitalAmount: bigint, atYieldFactor: bigint) {
    return BigInt((capitalAmount * atYieldFactor) / PERCENTAGE_FACTOR);
}

export function bpsToGrowthPerSecond(bps: number) {
    return BigInt(BigInt(bps).valueOf() * PERCENTAGE_FACTOR.valueOf() / (BigInt(10000).valueOf() * SECONDS_IN_A_YEAR.valueOf()));
}

export function calculateAdditionalYieldFactor(currentTime: BigInt, lastYieldFactorUpdate: BigInt, growthPerSecond: BigInt) {
    const timeInterval = currentTime.valueOf() - lastYieldFactorUpdate.valueOf()
    return BigInt(growthPerSecond.valueOf() * timeInterval)
}
