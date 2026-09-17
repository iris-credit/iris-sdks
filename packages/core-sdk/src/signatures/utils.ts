/** Given `isQuoteNonceUsed` in our contract is mapped by the `solver`, we can use simpler form as solvers are never going to response quotes in the same ms  */
export const randomNonce = () => BigInt(Date.now());
