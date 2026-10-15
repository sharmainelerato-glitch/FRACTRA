# FRACTRA — Organisational Resilience Simulation

**Hack Apertus Online Hackathon · Track 2B — Own Project**

FRACTRA is an organisational resilience platform for exploring how disruptions affect interconnected services, comparing response strategies, and learning from simulated incidents.

The project uses a deterministic simulation engine for repeatable scenario analysis and integrates the Apertus language model through the Public AI API for AI-assisted reasoning.

## The problem

Organisations depend on interconnected systems and services. A disruption in one area can cascade into others, making it difficult to anticipate consequences and compare possible responses.

FRACTRA aims to make these relationships easier to explore through structured simulations and an interactive workflow.

## How it works

The platform is designed around this workflow:

1. **Model** — represent an organisation and its dependencies.
2. **Simulate** — explore the effects of a disruption.
3. **Respond** — consider possible response strategies.
4. **Compare** — examine different outcomes.
5. **Calibrate and replay** — refine assumptions and revisit scenarios.
6. **Improve** — use the results to inform resilience planning.

The St. Aurelia Hospital scenario provides a fictional demonstration environment.

## Technology

- **Frontend:** React and Vite
- **Backend:** Python and Flask
- **Simulation:** deterministic application logic
- **Language model:** Apertus 1.5 8B through the Public AI API
- **Authentication:** Clerk integration
- **Deployment:** Vercel frontend and Render backend
- **Containerisation:** Docker and Docker Compose

## Run with Docker

From this directory, run:

```bash
make run
```

The local frontend is intended to be available at `http://localhost:8080`, and the backend at `http://localhost:5000`.

Configure the following environment variables when using model inference:

| Variable | Purpose |
|---|---|
| `LLM_NAME` | Model identifier; defaults to `swiss-ai/apertus-v1.5-8b` |
| `LLM_BASE_URL` | API base URL; defaults to `https://api.publicai.co/v1` |
| `LLM_API_KEY` | Public AI API key |

Do not commit API keys or other secrets to GitHub.

## Live demonstration

- **Frontend:** https://fractra.vercel.app/
- **Backend health check:** https://fractra-api.onrender.com/api/health
- **Source code:** https://github.com/sharmainelerato-glitch/FRACTRA

## Limitations

FRACTRA is a prototype for exploring organisational resilience. Simulation outcomes depend on the modelled dependencies and assumptions; they should not be treated as predictions of real incidents or as a substitute for professional risk assessment.

The live deployment uses hosted services, including Vercel, Render, Clerk, and Public AI. It is therefore **not an air-gapped deployment**, and the hosted version should not be described as fully sovereign infrastructure.

Model-assisted outputs may be incomplete or incorrect and should be reviewed by a human.

## Technical report

See [`technical_report.md`](technical_report.md) for the architecture, evaluation plan, reproducibility details, and limitations.