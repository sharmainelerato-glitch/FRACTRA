# FRACTRA

**Break it before reality does.**

FRACTRA is an organisational resilience platform that turns an organisation's dependency model into an executable simulation. It helps teams understand how disruptions propagate, record what happens during real incidents, identify where their model was wrong, and test whether proposed changes would improve resilience.

**The core idea:** use the same organisational model to prepare for disruption, support incident response, learn from reality, and test improvements.

Built for the **Hack Apertus 2026 Online Hackathon — Track 2B: Own Project**, FRACTRA uses Apertus as a bounded reasoning layer around a deterministic resilience engine.

## Try FRACTRA

- **Live application:** https://fractra.vercel.app/
- **Backend health check:** https://fractra-api.onrender.com/api/health
- **Source code:** https://github.com/sharmainelerato-glitch/FRACTRA

The live application is the recommended starting point for exploring the project. The backend health endpoint is provided for service availability checks, not as the main demonstration.

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

**MODEL → SIMULATE → RESPOND → COMPARE → CALIBRATE → REPLAY → IMPROVE**

| Stage | What FRACTRA does |
|---|---|
| **Before — Digital Twin** | Models systems and dependencies, simulates failures, and examines cascading effects. |
| **During — Digital Shadow** | Records human-confirmed observations, response actions, and incident timelines against the same organisational model. |
| **After — Reality Diff** | Compares the original model's predictions with recorded observations to expose discrepancies. |
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

Apertus does not independently determine authoritative failure cascades, establish real-world incident facts, approve its own proposed corrections, or decide whether a mitigation succeeded.

The intended boundary is:

**Deterministic engine → verified results → Apertus reasoning → human review → deterministic verification**

This separation keeps AI assistance useful without treating generated explanations as operational truth.

## Demonstration: St. Aurelia Hospital

FRACTRA includes a fictional hospital demonstration model designed to showcase its organisational resilience workflow.

A suggested demonstration journey:

1. Explore the organisational dependency graph.
2. Run a failure simulation or use **BREAK ME**.
3. Inspect the predicted cascade and resilience impact.
4. Start an incident and record observations and response actions.
5. End the incident and inspect the Reality Diff.
6. Review a proposed model correction.
7. Calibrate a new model branch.
8. Test a mitigation through **Fix + Replay**.

This journey illustrates how an incident can become evidence for improving the model and evaluating future decisions.

**Data disclaimer:** St. Aurelia Hospital and its demonstration records are fictional. They are illustrative data, not evidence of real hospital operations or validated clinical outcomes.

## Architecture

```text
                    FRACTRA FRONTEND
               React · React Flow · Clerk
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
                 Model change proposals
                           |
                  Counterfactual replay
```

### Technology stack

- **Frontend:** React, Vite, React Flow, Lucide React
- **Authentication:** Clerk
- **Backend:** Python, Flask, Flask-CORS
- **Simulation:** Deterministic FRACTRA resilience engine
- **AI reasoning:** Apertus 8B Instruct through the Public AI API
- **Prototype persistence:** JSON-backed records and model snapshots
- **Frontend hosting:** Vercel
- **Backend hosting:** Render

### Separation of responsibilities

The deterministic simulation engine and the AI reasoning layer have distinct responsibilities. Simulation results are produced by the application logic; Apertus provides supporting explanations and suggestions. Proposed changes remain subject to human review and verification.

This separation is intended to reduce reliance on unverified generated output when evaluating organisational resilience.

## Run locally

### Prerequisites

- Python 3
- Node.js and npm
- A Clerk application
- A Public AI API key with access to Apertus

### 1. Clone the repository

```bash
git clone https://github.com/sharmainelerato-glitch/FRACTRA.git
cd FRACTRA
```

### 2. Configure and run the backend

From the repository root:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

On macOS or Linux, activate the virtual environment with:

```bash
source venv/bin/activate
```

Create a file named `backend/.env` and configure your credentials:

```env
PUBLICAI_API_KEY=your_public_ai_api_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
```

Use your own credentials. Do not copy actual secrets into the repository or share them in screenshots.

Start the backend:

```bash
python app.py
```

The local API is expected to run at `http://127.0.0.1:5000`.

### 3. Configure and run the frontend

Open a second terminal at the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://127.0.0.1:5000
```

Start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

### 4. Environment configuration

For the hosted application:

- Configure `VITE_API_URL` in Vercel to point to the Render backend base URL.
- Configure `CLERK_SECRET_KEY` and `PUBLICAI_API_KEY` as backend environment variables in Render.
- Configure Clerk's permitted origins and authorized parties to match the actual deployment.
- Keep the Clerk publishable key in the frontend; never expose the Clerk secret key or Public AI API key to client-side code.

Environment variables and deployment settings must match the requirements of the selected environment.

## Deployment, privacy, and limitations

The current FRACTRA prototype is deployed with Vercel hosting the frontend and Render hosting the Flask backend. It uses hosted authentication, hosted AI inference, and JSON-backed persistence.

The current implementation should not be described as a fully sovereign, on-premises, or air-gapped deployment. Those deployment modes would require additional implementation and validation.

JSON-backed persistence is suitable only for the prototype's current scope. A production system would require a robust persistent database, backups, concurrency handling, access-control reviews, auditability, monitoring, and recovery procedures.

Additional validation would also be needed before using FRACTRA to support real operational decisions, especially in hospitals, emergency services, or critical infrastructure. The application is a decision-support prototype, not a substitute for qualified operational judgement, validated continuity plans, or emergency procedures.

AI-generated explanations and proposed model changes may be incomplete or incorrect. They should be reviewed by a person and verified against the deterministic engine and reliable operational evidence.

## Project status

FRACTRA is a working hackathon prototype demonstrating an integrated approach to organisational resilience, incident reconstruction, model calibration, and counterfactual testing.

Its central principle is:

> **Calibration makes the model more truthful. Mitigation makes the organisation more resilient.**

FRACTRA aims to connect what organisations expect to happen, what they observe during disruptions, and what they can change to improve their preparedness.

**FRACTRA — Break it before reality does.**