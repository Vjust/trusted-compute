// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use crate::common::IntentMessage;
use crate::common::{to_signed_response, IntentScope, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use rand::Rng;

/// Inner type T for IntentMessage<T>
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RandomResponse {
    pub random_number: u64,
    pub min: u64,
    pub max: u64,
}

/// Inner type T for ProcessDataRequest<T>
#[derive(Debug, Serialize, Deserialize)]
pub struct RandomRequest {
    pub min: u64,
    pub max: u64,
}

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<RandomRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<RandomResponse>>>, EnclaveError> {
    let min = request.payload.min;
    let max = request.payload.max;

    // Validate input
    if min >= max {
        return Err(EnclaveError::GenericError(
            "min must be less than max".to_string(),
        ));
    }

    // Generate random number using cryptographically secure RNG
    let mut rng = rand::thread_rng();
    let random_number = rng.gen_range(min..=max);

    let current_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("Failed to get current timestamp: {}", e)))?
        .as_millis() as u64;

    Ok(Json(to_signed_response(
        &state.eph_kp,
        RandomResponse {
            random_number,
            min,
            max,
        },
        current_timestamp,
        IntentScope::ProcessData,
    )))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::common::IntentMessage;
    use axum::{extract::State, Json};
    use fastcrypto::{ed25519::Ed25519KeyPair, traits::KeyPair};

    #[tokio::test]
    async fn test_process_data() {
        let state = Arc::new(AppState {
            eph_kp: Ed25519KeyPair::generate(&mut rand::thread_rng()),
            api_key: String::new(),
        });
        
        let signed_random_response = process_data(
            State(state),
            Json(ProcessDataRequest {
                payload: RandomRequest {
                    min: 1,
                    max: 100,
                },
            }),
        )
        .await
        .unwrap();
        
        let random_num = signed_random_response.response.data.random_number;
        assert!(random_num >= 1 && random_num <= 100);
    }

    #[test]
    fn test_serde() {
        use fastcrypto::encoding::{Encoding, Hex};
        let payload = RandomResponse {
            random_number: 42,
            min: 1,
            max: 100,
        };
        let timestamp = 1744038900000;
        let intent_msg = IntentMessage::new(payload, timestamp, IntentScope::ProcessData);
        let signing_payload = bcs::to_bytes(&intent_msg).expect("should not fail");
        
        // This will vary based on the exact structure, but ensures serialization works
        println!("Serialized: {}", Hex::encode(&signing_payload));
        assert!(!signing_payload.is_empty());
    }
}