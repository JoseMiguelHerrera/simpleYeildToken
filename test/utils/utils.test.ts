const PERCENTAGE_FACTOR: bigint = BigInt("1000000000000000000");
const SECONDS_IN_A_YEAR=BigInt(365*60*60*24);

export function convertToCapital(tokenAmount: bigint, atYeildFactor: bigint){
    return BigInt((tokenAmount * PERCENTAGE_FACTOR) / atYeildFactor);
}

export function convertToTokens(capitalAmount: bigint,atYeildFactor: bigint){
    return BigInt((capitalAmount * atYeildFactor) / PERCENTAGE_FACTOR);
}

export function bpsToGrowthPerSecond(bps: number){
    return BigInt(BigInt(bps).valueOf()*PERCENTAGE_FACTOR.valueOf()/(BigInt(10000).valueOf()*SECONDS_IN_A_YEAR.valueOf()));
}

export function calculateAdditionalYeildFactor(currentTime: BigInt, lastYeildFactorUpdate: BigInt, growthPerSecond: BigInt){
    const timeInterval = currentTime.valueOf()-lastYeildFactorUpdate.valueOf()
    return BigInt(growthPerSecond.valueOf()*timeInterval)
}
