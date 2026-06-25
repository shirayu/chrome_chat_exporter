
# Chat TOML Export Format Specification (v3.0)

## 1. Overview

This format is defined for integrating and migrating chat sessions, message histories, and workflow execution histories with other projects or tools.

* **Supported Versions**: `"2.0"`, `"3.0"`
* **Data Characteristics**:
    * Represented in TOML format, but structurally maps 1:1 completely with JSON.
    * Supports multimodal content (text, image, audio, document, AI's thinking process, etc.).

---

## 2. Overall Structure

An exported TOML file primarily consists of the following four sections.

1. **`[export_info]`** (Single Table): Metadata of the entire export.
2. **`[session]`** (Single Table): Basic information of the chat session itself.
3. **`[[messages]]`** (Array of Tables): List of messages included in the chat.
4. **`[workflow_execution_history]`** (Single Table): Execution history of workflows that were run.

---

## 3. Section Field Details

### 3.1. `[export_info]` (Export Information)

Administrative metadata related to the export.

| Field Name | Type | Required/Optional | Description |
| :--- | :--- | :--- | :--- |
| `format_version` | String | **Required** | The version of the format. Either `"2.0"` or `"3.0"`. |
| `exported_at` | String (ISO 8601) | **Required** | The date and time when the export was executed (e.g., `"2026-06-25T14:30:00.000Z"`). |

### 3.2. `[session]` (Session Information)

Basic metadata of the chat session itself.

| Field Name | Type | Required/Optional | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (UUIDv4) | Optional | Unique identifier of the session. |
| `title` | String | **Required** | Title of the chat session. |
| `user_id` | String (UUIDv4) | Optional | ID of the user who owns the session. |
| `created_at` | String (ISO 8601) | Optional | Date and time when the session was created. |
| `last_activity` | String (ISO 8601) | Optional | Date and time of the last activity in the session. |
| `metadata` | Table | Optional | Additional metadata of the session. See [3.2.1. Session Metadata](#321-session-metadata-metadata-table) for details. |

#### 3.2.1. Session Metadata (`metadata` Table)

| Field Name | Type | Required/Optional | Description |
| :--- | :--- | :--- | :--- |
| `message_count` | Integer | **Required** | Total number of messages in the session. |
| `models_used` | Array (Strings) | Optional | List of model names used in this session. |

### 3.3. `[[messages]]` (Array of Messages)

A list of messages that make up the conversation. Since this is an array of tables, each message is sequentially added as a `[[messages]]` section.

| Field Name | Type | Required/Optional | Description |
| :--- | :--- | :--- | :--- |
| `id` | String (UUIDv4) | Optional | Unique identifier of the message. |
| `role` | String | **Required** | The role of the sender. One of `"user"`, `"assistant"`, or `"system"`. |
| `content` | String | Optional (for v2.0) | Body of the message. Used in v2.0 format (deprecated in v3.0). |
| `text_content` | String | Optional (for v3.0) | Plain text body of the message. |
| `parts` | Array (Objects) | Optional (for v3.0) | Multimodal content parts. For details, see "4. Message Part Specification". |
| `session_id` | String (UUIDv4) | Optional | ID of the chat session to which the message belongs. |
| `user_id` | String (UUIDv4) | Optional | ID of the user who created the message. |
| `parent_chat_message_id` | String (UUIDv4) | Optional | ID of the parent message (used for representing thread structures or conversation branches). |
| `continuation_source_id` | String (UUIDv4) | Optional | ID of the message that was continued to generate this message. |
| `edited_source_id` | String (UUIDv4) | Optional | ID of the original message that was edited to generate this message. |
| `created_at` | String (ISO 8601) | Optional | Date and time when the message was created. |
| `generation_request` | Table | Optional | Snapshot of what was generated and with which settings. See [4.8. `generation_request` Field Specification](#48-generation_request-field-specification) for details. |
| `generation_result` | Table | Optional | Summary of the generation result. See [4.9. `generation_result` Field Specification](#49-generation_result-field-specification) for details. |
| `generation_telemetry` | Table | Optional | Observed values of the generation process and origins. See [4.10. `generation_telemetry` Field Specification](#410-generation_telemetry-field-specification) for details. |

### 3.4. `[workflow_execution_history]` (Workflow History)

Backend workflow execution logs that ran in association with the chat execution.

| Field Name | Type | Required/Optional | Description |
| :--- | :--- | :--- | :--- |
| `entries` | Array (Objects) | **Required** | List of executed workflow logs (can be an empty array `[]`). |
| `next_cursor` | String | Optional | Cursor for retrieving additional history (pagination). |

---

## 4. Message Part (`parts` Array) Specification

In `messages` of v3.0 and later, the `parts` array is used to express multimodal content. Each object in `parts` is distinguished by the `type` field and has a different structure.

### 4.1. `text` Part (Plain Text)

The most basic text message part.

* **`type`**: `"text"` (Fixed)
* **`text`** (String, **Required**): The text body.
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.

### 4.2. `image` Part (Image Data)

A part representing an image when it is input or output.

* **`type`**: `"image"` (Fixed)
* **`media_type`** (String, **Required**): MIME type of the image (e.g., `"image/png"`, `"image/jpeg"`, `"image/webp"`).
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.
* **`urls`** (Table, Optional): Map of URLs according to conditions such as resolution.
* **`default_url`** (String, Optional): Default image URL (Data URI format or signed URL).
* **`variants`** (Table, Optional): Paths to various image variants (such as thumbnails).
* **`expires_at`** (Integer, Optional): Unix timestamp indicating the expiration time of the URL.

### 4.3. `input_audio` Part (Input Audio)

Audio data input by the user.

* **`type`**: `"input_audio"` (Fixed)
* **`key`** (String, **Required**): Object key in the storage that identifies the audio data.
* **`media_type`** (String, **Required**): MIME type of the audio.
* **`format`** (String, **Required**): Container/compression format name of the audio.
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.

### 4.4. `output_audio` Part (Output Audio)

Audio data returned by the AI.

* **`type`**: `"output_audio"` (Fixed)
* **`key`** (String, **Required**): Object key in the storage that identifies the audio data.
* **`media_type`** (String, **Required**): MIME type of the audio.
* **`transcript`** (String, Optional): Transcription text of the audio.
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.

### 4.5. `document` Part (Document such as PDF)

Various documents sent for reference or attachment purposes.

* **`type`**: `"document"` (Fixed)
* **`key`** (String, **Required**): Object key in the storage that identifies the document data.
* **`media_type`** (String, **Required**): MIME type of the document (e.g., `"application/pdf"`).
* **`title`** (String, Optional): Display name or title of the document.
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.

### 4.6. `reasoning` Part (Thinking Process)

The thoughts (reasoning process) that the AI model went through while generating the response.

* **`type`**: `"reasoning"` (Fixed)
* **`thinking`** (String, **Required**): Text representing the model's reasoning/thinking process.
* **`id`** (String (UUIDv4), Optional): Unique ID of the part.

### 4.7. `unknown` Part (Unknown Part)

A fallback for parts defined only in newer versions or by specific providers that the system cannot interpret directly.

* **`type`** (String, **Required**): Any part identifier name.
* **`id`** (String (UUIDv4), **Required**): Unique ID of the part.

### 4.8. `generation_request` Field Specification

Represents the settings and parameters used for LLM generation.

* **`model`** (String, Optional): The identifier of the model used (e.g., `"gpt-4o"`, `"gemini-1.5-pro"`).
* **`chat_params`** (Table, Optional): OpenAI-compatible generation parameters.
    * **`temperature`** (Float, Optional): Sampling temperature (0.0 to 2.0).
    * **`max_tokens`** (Integer, Optional): Maximum tokens to generate.
    * **`max_completion_tokens`** (Integer, Optional): Maximum completion tokens to generate.
    * **`top_p`** (Float, Optional): Nucleus sampling probability.
    * **`presence_penalty`** (Float, Optional): Presence penalty (-2.0 to 2.0).
    * **`frequency_penalty`** (Float, Optional): Frequency penalty (-2.0 to 2.0).
    * **`stop`** (String or Array of Strings, Optional): Stop sequences.
    * **`verbosity`** (String, Optional): Verbosity level (`"low"`, `"medium"`, `"high"`).
    * (Other OpenAI-compatible parameters are allowed as keys).
* **`chat_prompt_config`** (Table, Optional): Prompt settings.
* **`prompt_length`** (Integer, Optional): Length of the prompt tokens.
* **`prefix_length`** (Integer, Optional): Length of the prefix tokens.

### 4.9. `generation_result` Field Specification

Summary of the generation result.

* **`finish_reason`** (String, Optional): The reason why generation finished (e.g., `"stop"`, `"length"`, `"content_filter"`).
* **`token_usage`** (Table, Optional): Token consumption summary.
    * **`prompt_tokens`** (Integer, Optional): Number of tokens in the prompt.
    * **`completion_tokens`** (Integer, Optional): Number of tokens in the completion.
    * **`total_tokens`** (Integer, Optional): Total tokens used (`prompt_tokens` + `completion_tokens`).

### 4.10. `generation_telemetry` Field Specification

Observed telemetry data of the generation process, including retrieval origins.

* **`started_at`** (String (ISO 8601), Optional): Timestamp when generation started.
* **`completed_at`** (String (ISO 8601), Optional): Timestamp when generation completed.
* **`time_to_first_token_ms`** (Integer, Optional): Time to first token in milliseconds.
* **`part_telemetry`** (Table, Optional): Table mapping ContentPart IDs to part-specific telemetry.
    * Keys are part IDs (String, UUIDv4), and values are tables containing:
        * **`source`** (String, Optional): Origin/source of the part content (e.g., `"model_generation"`, `"web_search"`, `"cache"`).
        * **`generated_started_at`** (String (ISO 8601), Optional): Generation start time for this part.
        * **`generated_completed_at`** (String (ISO 8601), Optional): Generation completion time for this part.
        * **`metadata`** (Table, Optional): Extra metadata associated with the part's retrieval or generation.
* **`transition_telemetry`** (Array of Tables, Optional): Telemetry of stream transitions (e.g., transition from reasoning to answer).
    * Each element is a table containing:
        * **`from_part_id`** (String (UUIDv4), Optional)
        * **`to_part_id`** (String (UUIDv4), Optional)
        * **`kind`** (String, Required): The transition kind (e.g., `"reasoning_to_answer"`).
        * **`at`** (String (ISO 8601), Optional)
        * **`duration_ms`** (Integer, Optional)
        * **`metadata`** (Table, Optional)

---

## 5. Compatibility and Normalization Rules by Version

### 5.1. Differences between v2.0 and v3.0

There are structural differences in how the message body is represented.

* **v2.0**: A simple structure that stores message text in a single string field `content`.
* **v3.0**: To support mixed content such as images and audio in addition to text-only dialogues, `text_content` and the `parts` array are primarily used.

### 5.2. Automatic Normalization Rules by Import Parser

In systems that interpret this format, to accept old `v2.0` format data while maintaining compatibility, the parser automatically converts (normalizes) the data into the `v3.0` structure using the following rules:

1. **`text_content` Fallback**:
   If `text_content` is omitted in a message and `content` exists instead, the value of `content` is applied as the value of `text_content`.
2. **Automatic Construction of the `parts` Array**:
   If the `parts` array is undefined or empty, an array consisting of a single text part is automatically generated using the fallback `text_content` value as follows:

   ```toml
   [[messages.parts]]
   type = "text"
   text = "<value of text_content>"
   ```

---

## 6. Sample TOML Data

Below is a sample of actual v3.0 data, consisting of a user message with an attached image and an assistant response with a reasoning process (thinking), along with generation parameters and telemetry metadata.

```toml
[export_info]
format_version = "3.0"
exported_at = "2026-06-25T14:30:00.000Z"

[session]
id = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
title = "Image Analysis Test"
user_id = "f4e3d2c1-b0a9-8f7e-6d5c-4b3a2f1e0d9c"
created_at = "2026-06-25T14:28:00.000Z"
last_activity = "2026-06-25T14:30:00.000Z"

[session.metadata]
message_count = 2
models_used = ["gemini-1.5-pro"]

# 1. Message from User (Text + Image Attachment)
[[messages]]
id = "msg-00000001-1111-2222-3333-444455556666"
role = "user"
text_content = "Please describe this image."
session_id = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
user_id = "f4e3d2c1-b0a9-8f7e-6d5c-4b3a2f1e0d9c"
created_at = "2026-06-25T14:28:30.000Z"

[[messages.parts]]
id = "part-00000001-2222-3333-4444-555566667777"
type = "text"
text = "Please describe this image."

[[messages.parts]]
id = "part-00000002-2222-3333-4444-555566667777"
type = "image"
media_type = "image/png"
default_url = "data:image/png;base64,iVBORw0KGgoAAA..." # Base64 format data as an example

# 2. Response from Assistant (Reasoning + Answer Text with Generation Parameters and Metadata)
[[messages]]
id = "msg-00000002-1111-2222-3333-444455556666"
role = "assistant"
text_content = "This is a landscape image depicting a blue sky and sea."
session_id = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"
user_id = "f4e3d2c1-b0a9-8f7e-6d5c-4b3a2f1e0d9c"
parent_chat_message_id = "msg-00000001-1111-2222-3333-444455556666"
created_at = "2026-06-25T14:29:00.000Z"

# Generation metadata fields:
[messages.generation_request]
model = "gemini-1.5-pro"
prompt_length = 150

[messages.generation_request.chat_params]
temperature = 0.7
max_tokens = 500
verbosity = "medium"

[messages.generation_result]
finish_reason = "stop"

[messages.generation_result.token_usage]
prompt_tokens = 150
completion_tokens = 45
total_tokens = 195

[messages.generation_telemetry]
started_at = "2026-06-25T14:28:59.000Z"
completed_at = "2026-06-25T14:29:00.000Z"
time_to_first_token_ms = 250

[messages.generation_telemetry.part_telemetry.part-00000003-2222-3333-4444-555566667777]
source = "model_generation"
generated_started_at = "2026-06-25T14:28:59.100Z"
generated_completed_at = "2026-06-25T14:28:59.500Z"

[messages.generation_telemetry.part_telemetry.part-00000004-2222-3333-4444-555566667777]
source = "model_generation"
generated_started_at = "2026-06-25T14:28:59.500Z"
generated_completed_at = "2026-06-25T14:29:00.000Z"

[[messages.parts]]
id = "part-00000003-2222-3333-4444-555566667777"
type = "reasoning"
thinking = "The user is asking for a description of the attached image. Since the image is a typical natural landscape (sky and sea), I will describe the objects concisely."

[[messages.parts]]
id = "part-00000004-2222-3333-4444-555566667777"
type = "text"
text = "This is a landscape image depicting a blue sky and sea."

[workflow_execution_history]
entries = []
```
