# Crypto Transaction Reconciliation Engine

A production-grade Node.js service that ingests two sources of crypto transaction data (user-exported and exchange-exported), matches transactions across them using configurable tolerance rules, and produces a structured reconciliation report.

---

# Repository

GitHub Repository:

https://github.com/BasavarajBankolli/Reconciliation-Engine.git

---

# Table of Contents

- Architecture Overview
- Tech Stack
- Project Structure
- Getting Started
- Configuration
- API Reference
- Matching Algorithm
- Data Quality Handling
- Key Design Decisions
- Scalability Notes

---

# Architecture Overview

```text
POST /api/v1/reconcile
        │
        ▼
 Ingestion Service
        │
        ▼
 Matching Service
        │
        ▼
 Reconciliation Results
        │
        ▼
 Report Service
```

The reconciliation process runs asynchronously.

`POST /api/v1/reconcile` immediately returns a `202 Accepted` response with a `runId`. Clients can later fetch reconciliation results using the reporting APIs.

---

# Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js | Efficient async I/O for CSV processing |
| Framework | Express.js | Lightweight and simple REST API framework |
| Database | MongoDB + Mongoose | Flexible schema design and indexing support |
| CSV Parsing | csv-parser | Streaming CSV parser |
| CSV Export | fast-csv | Efficient CSV streaming |
| Logging | Winston | Structured application logging |

---

# Project Structure

```text
src/
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── utils/
├── app.js
├── db.js
└── server.js
```

## Important Modules

| Folder | Responsibility |
|---|---|
| `controllers/` | Handles API request/response logic |
| `services/` | Core business logic (ingestion, matching, reporting) |
| `models/` | MongoDB schemas |
| `routes/` | Express route definitions |
| `utils/` | Asset aliases, type mappings, logger utilities |
| `middleware/` | Error handling and file upload middleware |

---

# Getting Started

## Prerequisites

- Node.js >= 18
- MongoDB running locally or remotely

---

## Installation

```bash
git clone https://github.com/BasavarajBankolli/Reconciliation-Engine.git
```

```
cd Reconciliation-Engine
```

```
npm install
```

---

## Environment Variables

Create a `.env` run following cmd from root directory.

#### Windows Powershell
```env
Copy-Item .env.example .env
```
#### Mac/Linux
```
cp .env.example .env
```

---

## Run the Application

```bash
npm run dev
```

Server runs at:

```text
http://localhost:3000
```

---

# API Reference

---

## Health Check

### GET `/health`

Returns server health status.

### Response

```json
{
    "status": "ok",
    "timestamp": "2026-05-23T08:49:59.556Z"
}
```

---

## Trigger Reconciliation

### POST `/api/v1/reconcile`

Starts a reconciliation run.

### Request Type

`multipart/form-data`

### Form Fields

| Field | Required | Description |
|---|---|---|
| `user_file` | Yes | User transaction CSV |
| `exchange_file` | Yes | Exchange transaction CSV |
| `timestampToleranceSeconds` | No | Override timestamp tolerance |
| `quantityTolerancePct` | No | Override quantity tolerance |

### Response

```json
{
  "runId": "uuid",
  "message": "Reconciliation started. Poll /api/v1/report/bdc6b33f-c251-44e0-b1eb-7977e7618bdf/summary for progress."
}
```
![alt text](<screenshots/reconcile api.png>)

---

## Fetch Full Report

### GET `/api/v1/report/:runId`

Returns the full reconciliation report.

![alt text](<screenshots/report api.png>)
---

## Fetch Summary

### GET `/api/v1/report/:runId/summary`

Returns reconciliation summary counts.

### Response

```json
{
  "runId": "uuid",
  "status": "COMPLETED",
  "summary": {
    "matched": 21,
    "conflicting": 1,
    "unmatchedUser": 5,
    "unmatchedExchange": 4
  }
}
```

![alt text](<screenshots/summary api.png>)

---

## Fetch Unmatched Transactions

### GET `/api/v1/report/:runId/unmatched`

Returns unmatched rows only.

![alt text](<screenshots/unmatched api.png>)

### MongoDB Schema 

![alt text](<screenshots/DB Schema.png>)
# Configuration

Configuration can be changed without code modifications using environment variables or request overrides.

| Variable | Default | Description |
|---|---|---|
| `TIMESTAMP_TOLERANCE_SECONDS` | `300` | Allowed timestamp difference |
| `QUANTITY_TOLERANCE_PCT` | `0.01` | Allowed quantity percentage difference |
| `MONGODB_URI` | `mongodb://localhost:27017/crypto_reconciler` | MongoDB connection |
| `PORT` | `3000` | Application port |
| `LOG_LEVEL` | `info` | Logging level |

---

# Matching Algorithm

## Matching Rules

A transaction pair is considered a candidate when:

- Asset matches
- Type matches
- Timestamp falls within tolerance
- Quantity falls within tolerance

---

## Asset Matching

Asset matching is:

- Case-insensitive
- Alias-aware

Examples:

| Alias | Canonical |
|---|---|
| Bitcoin | BTC |
| Ethereum | ETH |
| Polygon | MATIC |

---

## Type Mapping

The engine handles opposite transaction perspectives.

Examples:

| User Side | Exchange Side |
|---|---|
| `TRANSFER_OUT` | `TRANSFER_IN` |
| `WITHDRAWAL` | `DEPOSIT` |

---

## Best Match Selection

Among valid candidates, the engine selects the transaction with the lowest combined score:

```text
score =
(timestamp_delta / timestamp_tolerance)
+
(quantity_delta / quantity_tolerance)
```

---

## Match Classification

| Category | Meaning |
|---|---|
| `MATCHED` | Transaction matched within tolerances |
| `CONFLICTING` | Similar transaction found but conflicts exist |
| `UNMATCHED_USER` | User transaction has no exchange match |
| `UNMATCHED_EXCHANGE` | Exchange transaction has no user match |

---

# Data Quality Handling

Invalid rows are never silently discarded.

Each invalid row is stored with issue details.

| Issue Code | Description |
|---|---|
| `MISSING_REQUIRED_FIELD` | Required column missing |
| `MALFORMED_TIMESTAMP` | Invalid timestamp |
| `NEGATIVE_QUANTITY` | Quantity less than zero |
| `INVALID_QUANTITY` | Quantity not parseable |
| `UNKNOWN_TYPE` | Unsupported transaction type |
| `DUPLICATE_ID` | Duplicate transaction ID |

All quality issues are:

- logged
- persisted
- included in reconciliation reports

---

# Key Design Decisions

## Raw and Normalized Fields

Both raw and normalized values are stored.

- Raw fields preserve auditability
- Normalized fields improve matching efficiency

---

## Asynchronous Reconciliation

The reconciliation process is asynchronous to avoid blocking long-running requests.

---

## Embedded Snapshots in Reports

Transaction snapshots are embedded directly into reconciliation results to avoid expensive joins during report generation.

---

## Greedy Matching Strategy

A greedy matching approach was used for simplicity and performance.

A globally optimal assignment algorithm would improve accuracy in edge cases but adds significantly higher computational complexity.

---

# Scalability Notes

The current implementation is suitable for assignment-scale datasets.

For larger production workloads, the following improvements can be added:

- Indexed timestamp-range queries
- Background workers using queues
- Horizontal database sharding
- Streaming ingestion for very large CSV files
- Read replicas for report-heavy workloads

---

# Logging

Structured logs are generated using Winston.

The system logs:

- reconciliation lifecycle events
- ingestion statistics
- validation failures
- matching summaries
- API errors

---

# Assumptions

- CSV headers follow the provided assignment structure
- Exchange and user transaction IDs are independent
- Asset aliases are configurable
- Timestamp tolerance is symmetric
- Quantity tolerance is percentage-based