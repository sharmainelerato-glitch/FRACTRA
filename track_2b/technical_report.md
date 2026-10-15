# FRACTRA Technical Report

**Project:** FRACTRA — Organisational Resilience Simulation  
**Track:** Hack Apertus Online Hackathon, Track 2B — Own Project  
**Model configuration:** `swiss-ai/apertus-v1.5-8b`  
**Inference provider:** Public AI API

## 1. Abstract

FRACTRA is a prototype for exploring organisational resilience through structured simulation. It aims to help users represent dependencies between services, examine potential disruptions, compare response strategies, and use the results to improve resilience planning.

The system combines deterministic application logic with a language-model integration. The simulation engine is responsible for repeatable application calculations, while Apertus is intended to provide language-based reasoning and interpretation where the application invokes it.

The project is a decision-support prototype. It does not claim to predict real incidents or replace professional risk assessment.

## 2. Problem and motivation

Organisations rely on interconnected services. A disruption in one service can affect dependent services, creating consequences that are difficult to understand from isolated component views.

FRACTRA explores an interactive way to represent these relationships and examine hypothetical disruptions. Its fictional St. Aurelia Hospital environment provides a demonstration context for organisational resilience analysis without presenting the scenario as real operational evidence.

## 3. System architecture

The application consists of the following components:

- **React/Vite frontend:** presents the user interface and communicates with the backend.
- **Flask backend:** exposes the application's API and coordinates application operations.
- **Deterministic simulation logic:** provides the repeatable, application-defined parts of scenario analysis.
- **Apertus integration:** sends chat-completions requests through the Public AI API when model-assisted functionality is invoked.
- **Persistence:** the backend uses JSON files under its data directory for model state, incidents, and versions.
- **Authentication integration:** Clerk is configured through environment variables.

The backend uses the configured model identifier `swiss-ai/apertus-v1.5-8b` and the base URL `https://api.publicai.co/v1` by default. The model name and endpoint are configurable through `LLM_NAME` and `LLM_BASE_URL`; the API credential is provided through `LLM_API_KEY`.

The model request uses the chat-completions interface with a configured temperature and token limit. HTTP errors, connection failures, timeouts, and invalid JSON responses are handled explicitly by the request function.

## 4. Intended workflow

The product workflow is organised around modelling, simulation, response, comparison, calibration, replay, and improvement.

This workflow is intended to help users examine a disruption, compare alternative responses, and revisit assumptions. The quality of the resulting analysis depends on the organisation model, dependency definitions, scenario assumptions, and the reliability of any model-generated explanation.

## 5. Reproducibility and deployment

The source repository is:

https://github.com/sharmainelerato-glitch/FRACTRA

The hosted frontend is:

https://fractra.vercel.app/

The backend health endpoint is:

https://fractra-api.onrender.com/api/health

The repository includes Dockerfiles for the backend and frontend, a Docker Compose configuration, and a Makefile intended to launch the stack using `make run` from the `track_2b` directory.

The container build and startup procedure must be verified in a clean environment before this report is considered final. A successful health check alone would establish service availability, not correctness of every simulation feature or successful live model inference.

Required model-related environment variables:

- `LLM_NAME`: model identifier
- `LLM_BASE_URL`: inference API base URL
- `LLM_API_KEY`: inference API credential

Authentication-related configuration may also be required for protected application functionality. Secrets must be provided outside source control.

## 6. Evaluation plan and evidence

The following checks are required for a reproducible evaluation:

1. **Container build:** build the backend and frontend images from a clean checkout.
2. **Service startup:** launch the stack using `make run`.
3. **Health checks:** verify that the backend health endpoint returns a successful response and the frontend serves its application.
4. **Simulation checks:** run representative scenarios and check that repeated runs under the same conditions behave as expected where determinism is intended.
5. **Model integration:** make an authenticated request through the configured Apertus endpoint and record the model identifier, response status, and observed failure behaviour.
6. **Persistence checks:** verify that stored scenario or incident data behaves as intended across service restarts.
7. **Error handling:** test missing credentials, API failures, and timeouts without exposing secrets.

**Evaluation status:** these are planned checks, not claimed results. Record actual commands, outputs, failures, and fixes after running them. Do not report a test as passing unless it has been executed and its result recorded.

## 7. Limitations and responsible use

FRACTRA is a prototype. Simulation results depend on the assumptions and dependencies encoded in the application. A deterministic result is repeatable under the same conditions, but repeatability alone does not establish that a scenario accurately represents a real organisation.

Language-model outputs may be incomplete, inconsistent, or incorrect. They should not be treated as verified operational facts. Human review is necessary before using any generated analysis to inform real-world decisions.

The hosted application uses external services, including Vercel, Render, Clerk, and Public AI. Therefore, the current hosted deployment is not air-gapped and should not be described as a fully sovereign or self-hosted deployment.

Further work should include documented scenario tests, model-output evaluation, stronger persistence and recovery tests, and an assessment of deployment options for organisations with stricter data-control requirements.

## 8. Conclusion

FRACTRA explores how deterministic simulation and Apertus-assisted reasoning can be combined in an organisational resilience workflow. Its contribution should be evaluated through transparent scenario behaviour, reliable packaging, reproducible tests, and clearly stated limitations—not through unverified performance claims.