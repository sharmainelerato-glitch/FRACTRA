# FRACTRA

**Break it before reality does.**

FRACTRA is an organisational resilience platform that turns an organisation's dependency model into an executable simulation. It helps teams understand how disruptions propagate, record what happens during real incidents, identify where their model was wrong, and test whether proposed changes would improve resilience.

**The core idea:** use the same organisational model to prepare for disruption, support incident response, learn from reality, and test improvements.

Built for the **Hack Apertus 2026 Online Hackathon -- Track 2B: Own Project**, FRACTRA uses Apertus as a bounded reasoning layer around a deterministic resilience engine.

## The problem

Business continuity plans, static dependency diagrams, and post-incident reports can describe an organisation without making its dependencies executable.

Teams need to answer harder questions:

- What happens if a critical system fails?
- Which dependencies cause a cascading failure?
- How much time does backup capacity actually provide?
- What did the model predict incorrectly during an incident?
- Would a proposed change have improved the outcome?

FRACTRA connects these questions through one continuous workflow.

## How it works

**MODEL -> SIMULATE -> RESPOND -> COMPARE -> CALIBRATE -> REPLAY -> IMPROVE**

| Stage | What FRACTRA does |
|---|---|
| **Before -- Digital Twin** | Models systems and dependencies, simulates failures, and examines cascading effects. |
| **During -- Digital Shadow** | Records human-confirmed observations, response actions, and incident timelines against the same organisational model. |
| **After -- Reality Diff** | Compares the original model's predictions with recorded observations to expose discrepancies. |
| **Calibration** | Proposes model corrections for human review and creates new model branches from accepted changes. |
| **Fix + Replay** | Tests proposed resilience improvements against a calibrated baseline using the deterministic engine. |

The goal is not simply to predict failure. It is to make each incident an opportunity to improve the organisation's model and preparedness.

## What makes FRACTRA different?

### One model across the resilience lifecycle

Preparedness, response, post-incident analysis, and improvement are connected rather than treated as separate activities.

### Simulation grounded in deterministic logic

The resilience engine evaluates dependency relationships, failure propagation, redundancy, timing, backup runtime, and resilience scoring. The language model does not determine authoritative simulation outcomes.

### Learning from reality

FRACTRA compares predictions with human-recorded observations. Differences can reveal missing dependencies, inaccurate assumptions, or timing mismatches.

### Human-reviewed calibration

AI-generated suggestions are hypotheses, not facts. Accepted corrections create new model branches instead of silently overwriting the original model.

### Counterfactual resilience testing

FRACTRA distinguishes two questions:

- **Calibration:** Does the model better represent what happened?
- **Mitigation:** Would a proposed change improve the organisation's resilience?

A more accurate model does not automatically mean a more resilient organisation.

## Apertus: reasoning, not authority

FRACTRA uses `swiss-ai/apertus-8b-instruct` through the Public AI chat-completions API.

Apertus assists with tasks such as:

- Selecting structurally interesting failure scenarios from grounded candidates.
- Explaining deterministic simulation results.
- Suggesting organisational systems and relationships.
- Reviewing discrepancies between predictions and observations.
- Proposing model changes for human review.

Apertus does **not** independently determine failure cascades, establish real-world incident facts, approve its own proposed corrections, or decide whether a mitigation succeeded.

The intended boundary is:

**Deterministic engine -> verified results -> Apertus reasoning -> human review -> deterministic verification**

This separation keeps AI assistance useful without treating generated explanations as operational truth.

## Demonstration: St. Aurelia Hospital

FRACTRA includes a fictional hospital demonstration model designed to showcase the complete workflow.

A suggested demo journey:

1. Explore the organisational dependency graph.
2. Run a failure simulation or use **BREAK ME**.
3. Inspect the predicted cascade and resilience impact.
4. Start an incident and record observations and response actions.
5. End the incident and inspect the Reality Diff.
6. Review a proposed model correction.
7. Calibrate a new model branch.
8. Test a mitigation through **Fix + Replay**.

The demonstration illustrates how a single incident can become evidence for improving the model and evaluating future decisions.

**Demo data are illustrative and are not evidence of real hospital operations.**

## Architecture

```text
                    FRACTRA FRONTEND
                React Â· React Flow Â· Clerk
                          |
                   Authenticated API
                          |
                    Flask Backend
                     /          \
                    /            \
       Deterministic Engine     Apertus
       - Failure propagation   - Explanations
       - Dependencies           - Hypotheses
       - Redundancy              - Suggestions
       - Timing                  - Gap analysis
       - Resilience scoring
                    \            /
                     Human review
                          |
                 Versioned model changes
                          |
                 Counterfactual replay
```

### Technology stack

- **Frontend:** React, Vite, React Flow, Lucide React
- **Authentication and tenancy:** Clerk
- **Backend:** Python, Flask, Flask-CORS
- **Simulation:** Deterministic FRACTRA resilience engine
- **AI reasoning:** Apertus 8B Instruct via Public AI API
- **Prototype persistence:** JSON-backed records and model snapshots

## Run locally

### Prerequisites

- Node.js and npm
- Python 3
- A Clerk application
- A Public AI API key with access to Apertus

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd FRACTRA
```

### 2. Configure and run the backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create `backend/.env`:

```env
PUBLICAI_API_KEY=your_public_ai_api_key
CLERK_SECRET_KEY=your_clerk_secret_key
```

Start the backend:

```powershell
python app.py
```

The local API runs at `http://127.0.0.1:5000`.

### 3. Configure and run the frontend

Open a second terminal:

```powershell
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

Start Vite:

```powershell
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

For a hosted deployment, configure `VITE_API_URL` to the backend's base URL and set the appropriate Clerk environment variables and authorised origins.

**Never commit `.env` files, API keys, or secret credentials.**

## Deployment and data boundaries

The current prototype uses hosted authentication and AI inference services, with JSON-backed persistence.

A production deployment would require additional work around persistent storage, backups, operational monitoring, access controls, and deployment-specific security hardening. JSON-backed storage should not be treated as a production database for concurrent or critical operational workloads.

FRACTRA's architecture separates the deterministic resilience engine from the AI reasoning layer. This provides a path toward organisation-controlled infrastructure and self-hosted inference, but does not mean the current prototype is already a fully sovereign deployment.

The included hospital model and incident records are demonstration data. FRACTRA should not be used as the sole basis for real-world emergency, clinical, or critical-infrastructure decisions.

## Project status

FRACTRA is a hackathon prototype demonstrating an integrated approach to organisational resilience, incident reconstruction, model calibration, and counterfactual testing.

Its central principle is:

> **Calibration makes the model more truthful. Mitigation makes the organisation more resilient.**

**FRACTRA -- Break it before reality does.**
