// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

module app::random;

use enclave::enclave::{Self, Enclave};

const RANDOM_INTENT: u8 = 0;
const EInvalidSignature: u64 = 1;
const EInvalidRange: u64 = 2;

/// NFT that stores a verified random number
public struct RandomNFT has key, store {
    id: UID,
    random_number: u64,
    min: u64,
    max: u64,
    timestamp_ms: u64,
}

/// Should match the inner struct T used for IntentMessage<T> in Rust
public struct RandomResponse has copy, drop {
    random_number: u64,
    min: u64,
    max: u64,
}

/// One-time witness for initialization
public struct RANDOM has drop {}

fun init(otw: RANDOM, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);

    cap.create_enclave_config(
        b"random number generator enclave".to_string(),
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr0 - update after build
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr1 - update after build
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // pcr2 - update after build
        ctx,
    );

    transfer::public_transfer(cap, ctx.sender())
}

/// Submit a random number from the enclave and mint an NFT
public fun submit_random<T>(
    random_number: u64,
    min: u64,
    max: u64,
    timestamp_ms: u64,
    sig: &vector<u8>,
    enclave: &Enclave<T>,
    ctx: &mut TxContext,
): RandomNFT {
    // Validate range
    assert!(min < max, EInvalidRange);
    assert!(random_number >= min && random_number <= max, EInvalidRange);

    // Verify signature
    let res = enclave.verify_signature(
        RANDOM_INTENT,
        timestamp_ms,
        RandomResponse { random_number, min, max },
        sig,
    );
    assert!(res, EInvalidSignature);

    // Mint NFT with verified random number
    RandomNFT {
        id: object::new(ctx),
        random_number,
        min,
        max,
        timestamp_ms,
    }
}

/// Public getter functions
public fun random_number(nft: &RandomNFT): u64 {
    nft.random_number
}

public fun min(nft: &RandomNFT): u64 {
    nft.min
}

public fun max(nft: &RandomNFT): u64 {
    nft.max
}

public fun timestamp_ms(nft: &RandomNFT): u64 {
    nft.timestamp_ms
}

#[test_only]
public fun destroy_for_testing(nft: RandomNFT) {
    let RandomNFT { id, .. } = nft;
    id.delete();
}