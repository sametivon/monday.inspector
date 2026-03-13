export const MONDAY_API_URL = "https://api.monday.com/v2";

/** Maximum mutations per batch (monday.com complexity budget) */
export const BATCH_SIZE = 5;

/** Delay between batches in ms to respect rate limits */
export const BATCH_DELAY_MS = 1_500;

/** Max retries for a failed API call */
export const MAX_RETRIES = 3;

/** Base retry delay in ms (exponential backoff) */
export const RETRY_BASE_DELAY_MS = 2_000;

/** Special sentinel value for mapping the subitem name column */
export const SUBITEM_NAME_SENTINEL = "__subitem_name__";

/** Storage keys */
export const STORAGE_KEY_TOKEN = "monday_api_token";
