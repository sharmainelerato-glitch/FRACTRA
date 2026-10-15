import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import requests
from dotenv import load_dotenv
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from flask import Flask, jsonify, request, g
from flask_cors import CORS

from engine import simulate_failure

load_dotenv()
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "").strip()
CLERK_AUTHORIZED_PARTIES = [x.strip() for x in os.getenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
clerk_client = Clerk(bearer_auth=CLERK_SECRET_KEY) if CLERK_SECRET_KEY else None
app = Flask(__name__)
CORS(app)

PUBLICAI_API_KEY = (
    os.getenv("LLM_API_KEY")
    or os.getenv("PUBLICAI_API_KEY")
    or ""
).strip()


PUBLICAI_BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "https://api.publicai.co/v1"
).rstrip("/")

APERTUS_MODEL = os.getenv(
    "LLM_NAME",
    os.getenv("APERTUS_MODEL", "swiss-ai/apertus-v1.5-8b")
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DEFAULT_MODEL = DATA_DIR / "st-aurelia.json"
INCIDENTS_DIR = DATA_DIR / "incidents"
INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)
VERSIONS_DIR = DATA_DIR / "versions"
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# HELPERS
# ---------------------------------------------------------

def load_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=2)


def current_org_id():
    return getattr(g, "clerk_org_id", None)


SHARED_DEMO_MODEL_ID = "st-aurelia"


def is_shared_demo(model):
    """Only the original St. Aurelia seed is globally readable."""
    org = model.get("organization", {})
    return org.get("id") == SHARED_DEMO_MODEL_ID


def model_is_accessible(model):
    """A model is visible only if it is the shared seed or belongs to the active Clerk org."""
    org = model.get("organization", {})
    return is_shared_demo(model) or org.get("clerk_org_id") == current_org_id()


def incident_is_accessible(incident):
    return incident.get("clerk_org_id") == current_org_id()


def quarantine_accidentally_claimed_legacy_data_once():
    """
    Repair the earlier development migration that assigned every pre-Clerk local
    model/incident to the first Clerk organisation.

    This runs once. It uses the old marker to identify the organisation that was
    accidentally assigned, removes that assignment from the legacy files, and
    leaves the original St. Aurelia seed as the only shared model.
    """
    old_marker = DATA_DIR / ".clerk_legacy_claimed"
    repaired_marker = DATA_DIR / ".clerk_legacy_quarantined"

    if repaired_marker.exists() or not old_marker.exists():
        return

    claimed_org_id = old_marker.read_text(encoding="utf-8").strip()
    if not claimed_org_id:
        return

    repaired_models = 0
    repaired_incidents = 0

    for path in DATA_DIR.glob("*.json"):
        try:
            model = load_json(path)
            org = model.get("organization", {})
            if is_shared_demo(model):
                # The seed is globally readable, but it never belongs to a tenant.
                org.pop("clerk_org_id", None)
                save_json(path, model)
                continue

            if org.get("clerk_org_id") == claimed_org_id:
                org.pop("clerk_org_id", None)
                org["legacy_pre_clerk"] = True
                save_json(path, model)
                repaired_models += 1
        except (json.JSONDecodeError, OSError, AttributeError):
            continue

    for path in INCIDENTS_DIR.glob("*.json"):
        try:
            incident = load_json(path)
            if incident.get("clerk_org_id") == claimed_org_id:
                incident.pop("clerk_org_id", None)
                incident["legacy_pre_clerk"] = True
                save_json(path, incident)
                repaired_incidents += 1
        except (json.JSONDecodeError, OSError, AttributeError):
            continue

    repaired_marker.write_text(
        json.dumps({
            "repaired_at": datetime.now(timezone.utc).isoformat(),
            "previous_claimed_org_id": claimed_org_id,
            "models_quarantined": repaired_models,
            "incidents_quarantined": repaired_incidents,
        }, indent=2),
        encoding="utf-8",
    )


quarantine_accidentally_claimed_legacy_data_once()


def slugify(value):
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def get_model_path(model_id):
    return DATA_DIR / f"{model_id}.json"


def load_model(model_id=None):
    if model_id:
        path = get_model_path(model_id)

        if path.exists():
            return load_json(path)

    return load_json(DEFAULT_MODEL)



def save_model(model):
    if not is_shared_demo(model) and current_org_id():
        organization = model.setdefault("organization", {})
        organization["clerk_org_id"] = current_org_id()
        organization["demo"] = False
        organization.pop("legacy_pre_clerk", None)
    model_id = model.get("organization", {}).get("id")
    if not model_id:
        raise ValueError("Model organization.id is required.")
    path = DATA_DIR / f"{model_id}.json"
    path.write_text(json.dumps(model, indent=2), encoding="utf-8")
    return path


def clean_requirement_group(value):
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    return slugify(value)


def validate_model(model):
    organization = model.get("organization")
    systems = model.get("systems")
    dependencies = model.get("dependencies")

    if not organization:
        return "Organization information is required."

    if not organization.get("name"):
        return "Organization name is required."

    if not isinstance(systems, list):
        return "Systems must be a list."

    if not isinstance(dependencies, list):
        return "Dependencies must be a list."

    system_ids = {
        system.get("id")
        for system in systems
        if system.get("id")
    }

    if len(system_ids) != len(systems):
        return "Every system must have a unique ID."

    for system in systems:
        criticality = system.get(
            "criticality",
            1
        )

        try:
            criticality = int(
                criticality
            )
        except (TypeError, ValueError):
            return (
                f"Invalid criticality for "
                f"{system.get('id', 'system')}."
            )

        if criticality < 1 or criticality > 5:
            return (
                "System criticality must be "
                "between 1 and 5."
            )

        runtime = system.get(
            "max_runtime_minutes"
        )

        if runtime is not None:
            try:
                runtime = int(runtime)
            except (TypeError, ValueError):
                return (
                    "Maximum runtime must "
                    "be a number."
                )

            if runtime <= 0:
                return (
                    "Maximum runtime must "
                    "be greater than zero."
                )

    for dependency in dependencies:
        source = dependency.get("source")
        target = dependency.get("target")

        if source not in system_ids:
            return (
                f"Unknown dependency source: "
                f"{source}"
            )

        if target not in system_ids:
            return (
                f"Unknown dependency target: "
                f"{target}"
            )

        if source == target:
            return (
                "A system cannot depend "
                "on itself."
            )

        failure_effect = dependency.get(
            "failure_effect",
            "failed"
        )

        if failure_effect not in {
            "failed",
            "degraded",
        }:
            return (
                "Failure effect must be "
                "'failed' or 'degraded'."
            )

        delay = dependency.get(
            "delay_minutes",
            1
        )

        try:
            delay = int(delay)
        except (TypeError, ValueError):
            return (
                "Dependency delay must "
                "be a number."
            )

        if delay < 0:
            return (
                "Dependency delay cannot "
                "be negative."
            )

    return None


# ---------------------------------------------------------
# HEALTH
# ---------------------------------------------------------

@app.before_request
def clerk_auth_and_tenant_context():
    if not request.path.startswith("/api/") or request.method == "OPTIONS" or request.path == "/api/health":
        return None
    if not clerk_client:
        return jsonify({"error": "Clerk authentication is not configured."}), 503
    try:
        state = clerk_client.authenticate_request(
            request,
            AuthenticateRequestOptions(authorized_parties=CLERK_AUTHORIZED_PARTIES),
        )
    except Exception:
        return jsonify({"error": "Authentication verification failed."}), 401
    if not state.is_signed_in:
        return jsonify({"error": "Authentication required."}), 401
    payload = state.payload or {}
    g.clerk_user_id = payload.get("sub")
    g.clerk_org_id = payload.get("org_id")
    if not g.clerk_org_id:
        return jsonify({"error": "Select or create an organisation workspace before using FRACTRA."}), 403
    view_args = request.view_args or {}
    incident_id = view_args.get("incident_id")
    if incident_id and "load_incident" in globals():
        incident = load_incident(incident_id)
        if incident is not None and not incident_is_accessible(incident):
            return jsonify({"error": "Incident not found."}), 404

    model_id = view_args.get("model_id") or request.args.get("model_id")
    if not model_id and request.method in {"POST", "PUT", "PATCH"}:
        body = request.get_json(silent=True) or {}
        model_id = body.get("model_id")
    if model_id:
        path = get_model_path(str(model_id))
        if path.exists():
            try:
                model = load_json(path)
                if not model_is_accessible(model):
                    return jsonify({"error": "Organization model not found."}), 404
                if (
                    is_shared_demo(model)
                    and request.path.startswith(f"/api/models/{model_id}")
                    and request.method in {"POST", "PUT", "PATCH", "DELETE"}
                ):
                    return jsonify({
                        "error": "The shared St. Aurelia demo is read-only. Create your own organisation model to make changes."
                    }), 403
            except Exception:
                return jsonify({"error": "Organization model not found."}), 404
    return None


@app.get("/api/auth/context")
def auth_context():
    return jsonify({"user_id": g.clerk_user_id, "organization_id": g.clerk_org_id})


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": (
            "FRACTRA Simulation Engine"
        )
    })


# ---------------------------------------------------------
# MODELS
# ---------------------------------------------------------

@app.get("/api/model")
def get_default_model():
    """
    Returns the seeded St. Aurelia
    demo model.
    """

    return jsonify(load_model())


@app.get("/api/models")
def get_models():
    """
    Return every organization model
    currently stored.
    """

    models = []

    for path in DATA_DIR.glob("*.json"):
        try:
            model = load_json(path)

            organization = model.get(
                "organization",
                {}
            )

            if not model_is_accessible(model):
                continue

            models.append({
                "id": organization.get(
                    "id",
                    path.stem
                ),

                "name": organization.get(
                    "name",
                    path.stem
                ),

                "type": organization.get(
                    "type",
                    "unknown"
                ),

                "demo": organization.get(
                    "demo",
                    False
                ),

                "systems": len(
                    model.get(
                        "systems",
                        []
                    )
                ),

                "dependencies": len(
                    model.get(
                        "dependencies",
                        []
                    )
                ),
            })

        except (
            json.JSONDecodeError,
            OSError
        ):
            continue

    models.sort(
        key=lambda item: (
            not item["demo"],
            item["name"].lower()
        )
    )

    return jsonify(models)


@app.get("/api/models/<model_id>")
def get_model(model_id):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": (
                "Organization model "
                "not found."
            )
        }), 404

    model = load_json(path)
    if not model_is_accessible(model):
        return jsonify({"error": "Organization model not found."}), 404
    return jsonify(model)


@app.post("/api/models")
def create_model():
    """
    Create an organization without
    modifying source code.
    """

    body = (
        request.get_json(
            silent=True
        ) or {}
    )

    name = str(
        body.get("name", "")
    ).strip()

    organization_type = str(
        body.get(
            "type",
            "organization"
        )
    ).strip()

    if not name:
        return jsonify({
            "error": (
                "Organization name "
                "is required."
            )
        }), 400

    model_id = slugify(name)

    if not model_id:
        return jsonify({
            "error": (
                "Invalid organization "
                "name."
            )
        }), 400

    path = get_model_path(model_id)

    if path.exists():
        return jsonify({
            "error": (
                "An organization with "
                "this name already exists."
            )
        }), 409

    model = {
        "organization": {
            "id": model_id,
            "name": name,
            "type": (
                organization_type
                or "organization"
            ),
            "demo": False,
        },

        "systems": [],
        "dependencies": [],
    }

    save_model(model)

    return jsonify(model), 201


@app.put("/api/models/<model_id>")
def update_model(model_id):
    """
    Save a complete edited dependency
    model.
    """

    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": (
                "Organization model "
                "not found."
            )
        }), 404

    body = (
        request.get_json(
            silent=True
        ) or {}
    )

    validation_error = (
        validate_model(body)
    )

    if validation_error:
        return jsonify({
            "error": validation_error
        }), 400

    body["organization"]["id"] = (
        model_id
    )
    body["organization"]["clerk_org_id"] = current_org_id()

    save_model(body)

    return jsonify(body)


# ---------------------------------------------------------
# SYSTEMS
# ---------------------------------------------------------

@app.post(
    "/api/models/<model_id>/systems"
)
def add_system(model_id):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": (
                "Organization model "
                "not found."
            )
        }), 404

    model = load_json(path)

    body = (
        request.get_json(
            silent=True
        ) or {}
    )

    name = str(
        body.get("name", "")
    ).strip()

    if not name:
        return jsonify({
            "error": (
                "System name is required."
            )
        }), 400

    system_id = slugify(name)

    if not system_id:
        return jsonify({
            "error": (
                "Invalid system name."
            )
        }), 400

    existing = {
        system["id"]
        for system in model["systems"]
    }

    if system_id in existing:
        return jsonify({
            "error": (
                "This system already "
                "exists."
            )
        }), 409

    criticality = body.get(
        "criticality",
        3
    )

    try:
        criticality = int(
            criticality
        )
    except (TypeError, ValueError):
        criticality = 3

    criticality = max(
        1,
        min(5, criticality)
    )

    category = str(
        body.get(
            "category",
            "general"
        )
    ).strip()

    if not category:
        category = "general"

    standby = body.get(
        "standby",
        False
    )

    if isinstance(standby, str):
        standby = (
            standby.lower()
            in {
                "true",
                "1",
                "yes",
                "on",
            }
        )
    else:
        standby = bool(standby)

    system = {
        "id": system_id,
        "name": name,
        "category": category,
        "criticality": criticality,
        "standby": standby,
    }

    runtime = body.get(
        "max_runtime_minutes"
    )

    if runtime not in {
        None,
        "",
    }:
        try:
            runtime = int(runtime)
        except (TypeError, ValueError):
            return jsonify({
                "error": (
                    "Maximum runtime must "
                    "be a number."
                )
            }), 400

        if runtime <= 0:
            return jsonify({
                "error": (
                    "Maximum runtime must "
                    "be greater than zero."
                )
            }), 400

        if not standby:
            return jsonify({
                "error": (
                    "Maximum runtime can "
                    "only be assigned to "
                    "a standby system."
                )
            }), 400

        system[
            "max_runtime_minutes"
        ] = runtime

    model["systems"].append(system)

    save_json(path, model)

    return jsonify(system), 201

# ---------------------------------------------------------
# EDIT / DELETE SYSTEMS
# ---------------------------------------------------------

@app.put(
    "/api/models/<model_id>/systems/<system_id>"
)
def update_system(model_id, system_id):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": "Organization model not found."
        }), 404

    model = load_json(path)
    body = request.get_json(silent=True) or {}

    system = next(
        (
            item
            for item in model["systems"]
            if item["id"] == system_id
        ),
        None
    )

    if system is None:
        return jsonify({
            "error": "System not found."
        }), 404

    # ---------------------------------------------
    # NAME
    # ---------------------------------------------

    if "name" in body:
        name = str(
            body.get("name", "")
        ).strip()

        if not name:
            return jsonify({
                "error": "System name is required."
            }), 400

        system["name"] = name

    # ---------------------------------------------
    # CATEGORY
    # ---------------------------------------------

    if "category" in body:
        category = str(
            body.get(
                "category",
                "general"
            )
        ).strip()

        system["category"] = (
            category or "general"
        )

    # ---------------------------------------------
    # CRITICALITY
    # ---------------------------------------------

    if "criticality" in body:
        try:
            criticality = int(
                body["criticality"]
            )
        except (TypeError, ValueError):
            return jsonify({
                "error": (
                    "Criticality must be "
                    "a number."
                )
            }), 400

        if (
            criticality < 1
            or criticality > 5
        ):
            return jsonify({
                "error": (
                    "Criticality must be "
                    "between 1 and 5."
                )
            }), 400

        system["criticality"] = (
            criticality
        )

    # ---------------------------------------------
    # STANDBY
    # ---------------------------------------------

    if "standby" in body:
        standby = body["standby"]

        if isinstance(standby, str):
            standby = (
                standby.lower()
                in {
                    "true",
                    "1",
                    "yes",
                    "on",
                }
            )
        else:
            standby = bool(standby)

        system["standby"] = standby

        if not standby:
            system.pop(
                "max_runtime_minutes",
                None
            )

    # ---------------------------------------------
    # MAXIMUM RUNTIME
    # ---------------------------------------------

    if "max_runtime_minutes" in body:
        runtime = body[
            "max_runtime_minutes"
        ]

        if runtime in {
            None,
            "",
        }:
            system.pop(
                "max_runtime_minutes",
                None
            )

        else:
            try:
                runtime = int(runtime)
            except (
                TypeError,
                ValueError
            ):
                return jsonify({
                    "error": (
                        "Maximum runtime "
                        "must be a number."
                    )
                }), 400

            if runtime <= 0:
                return jsonify({
                    "error": (
                        "Maximum runtime "
                        "must be greater "
                        "than zero."
                    )
                }), 400

            if not system.get(
                "standby",
                False
            ):
                return jsonify({
                    "error": (
                        "Maximum runtime "
                        "can only be assigned "
                        "to a standby system."
                    )
                }), 400

            system[
                "max_runtime_minutes"
            ] = runtime

    save_json(path, model)

    return jsonify(system)


@app.delete(
    "/api/models/<model_id>/systems/<system_id>"
)
def delete_system(model_id, system_id):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": "Organization model not found."
        }), 404

    model = load_json(path)

    existing = next(
        (
            system
            for system in model["systems"]
            if system["id"] == system_id
        ),
        None
    )

    if existing is None:
        return jsonify({
            "error": "System not found."
        }), 404

    model["systems"] = [
        system
        for system in model["systems"]
        if system["id"] != system_id
    ]

    # Remove dependencies that reference
    # the deleted system.
    model["dependencies"] = [
        dependency
        for dependency
        in model["dependencies"]
        if (
            dependency["source"]
            != system_id
            and dependency["target"]
            != system_id
        )
    ]

    save_json(path, model)

    return jsonify({
        "deleted": system_id
    })


# ---------------------------------------------------------
# DEPENDENCIES
# ---------------------------------------------------------

@app.post(
    "/api/models/<model_id>/dependencies"
)
def add_dependency(model_id):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": (
                "Organization model "
                "not found."
            )
        }), 404

    model = load_json(path)

    body = (
        request.get_json(
            silent=True
        ) or {}
    )

    source = body.get("source")
    target = body.get("target")

    system_ids = {
        system["id"]
        for system in model["systems"]
    }

    if source not in system_ids:
        return jsonify({
            "error": (
                "Source system does "
                "not exist."
            )
        }), 400

    if target not in system_ids:
        return jsonify({
            "error": (
                "Target system does "
                "not exist."
            )
        }), 400

    if source == target:
        return jsonify({
            "error": (
                "A system cannot depend "
                "on itself."
            )
        }), 400

    duplicate = any(
        dependency["source"] == source
        and dependency["target"] == target
        for dependency
        in model["dependencies"]
    )

    if duplicate:
        return jsonify({
            "error": (
                "This dependency "
                "already exists."
            )
        }), 409

    failure_effect = body.get(
        "failure_effect",
        "failed"
    )

    if failure_effect not in {
        "failed",
        "degraded",
    }:
        return jsonify({
            "error": (
                "Failure effect must be "
                "'failed' or 'degraded'."
            )
        }), 400

    dependency_type = str(
        body.get(
            "type",
            "service"
        )
    ).strip()

    if not dependency_type:
        dependency_type = "service"

    delay = body.get(
        "delay_minutes",
        1
    )

    try:
        delay = int(delay)
    except (TypeError, ValueError):
        return jsonify({
            "error": (
                "Failure delay must "
                "be a number."
            )
        }), 400

    if delay < 0:
        return jsonify({
            "error": (
                "Failure delay cannot "
                "be negative."
            )
        }), 400

    requirement_group = (
        clean_requirement_group(
            body.get(
                "requirement_group"
            )
        )
    )

    dependency = {
        "source": source,
        "target": target,
        "type": dependency_type,
        "failure_effect":
            failure_effect,
        "delay_minutes": delay,
    }

    if requirement_group:
        dependency[
            "requirement_group"
        ] = requirement_group

    model["dependencies"].append(
        dependency
    )

    save_json(path, model)

    return jsonify(
        dependency
    ), 201

# ---------------------------------------------------------
# EDIT / DELETE DEPENDENCIES
# ---------------------------------------------------------

@app.put(
    "/api/models/<model_id>/dependencies/<int:dependency_index>"
)
def update_dependency(
    model_id,
    dependency_index
):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": "Organization model not found."
        }), 404

    model = load_json(path)

    if (
        dependency_index < 0
        or dependency_index
        >= len(model["dependencies"])
    ):
        return jsonify({
            "error": "Dependency not found."
        }), 404

    body = request.get_json(
        silent=True
    ) or {}

    dependency = model[
        "dependencies"
    ][dependency_index]

    system_ids = {
        system["id"]
        for system in model["systems"]
    }

    source = body.get(
        "source",
        dependency["source"]
    )

    target = body.get(
        "target",
        dependency["target"]
    )

    if source not in system_ids:
        return jsonify({
            "error": (
                "Source system does not exist."
            )
        }), 400

    if target not in system_ids:
        return jsonify({
            "error": (
                "Target system does not exist."
            )
        }), 400

    if source == target:
        return jsonify({
            "error": (
                "A system cannot depend "
                "on itself."
            )
        }), 400

    # Prevent duplicates, excluding
    # the dependency being edited.
    duplicate = any(
        index != dependency_index
        and item["source"] == source
        and item["target"] == target
        for index, item
        in enumerate(
            model["dependencies"]
        )
    )

    if duplicate:
        return jsonify({
            "error": (
                "This dependency "
                "already exists."
            )
        }), 409

    failure_effect = body.get(
        "failure_effect",
        dependency.get(
            "failure_effect",
            "failed"
        )
    )

    if failure_effect not in {
        "failed",
        "degraded",
    }:
        return jsonify({
            "error": (
                "Failure effect must be "
                "'failed' or 'degraded'."
            )
        }), 400

    dependency_type = str(
        body.get(
            "type",
            dependency.get(
                "type",
                "service"
            )
        )
    ).strip()

    if not dependency_type:
        dependency_type = "service"

    delay = body.get(
        "delay_minutes",
        dependency.get(
            "delay_minutes",
            1
        )
    )

    try:
        delay = int(delay)
    except (TypeError, ValueError):
        return jsonify({
            "error": (
                "Failure delay must "
                "be a number."
            )
        }), 400

    if delay < 0:
        return jsonify({
            "error": (
                "Failure delay cannot "
                "be negative."
            )
        }), 400

    requirement_group = (
        clean_requirement_group(
            body.get(
                "requirement_group",
                dependency.get(
                    "requirement_group"
                )
            )
        )
    )

    updated = {
        "source": source,
        "target": target,
        "type": dependency_type,
        "failure_effect":
            failure_effect,
        "delay_minutes": delay,
    }

    if requirement_group:
        updated[
            "requirement_group"
        ] = requirement_group

    model[
        "dependencies"
    ][dependency_index] = updated

    save_json(path, model)

    return jsonify(updated)


@app.delete(
    "/api/models/<model_id>/dependencies/<int:dependency_index>"
)
def delete_dependency(
    model_id,
    dependency_index
):
    path = get_model_path(model_id)

    if not path.exists():
        return jsonify({
            "error": "Organization model not found."
        }), 404

    model = load_json(path)

    if (
        dependency_index < 0
        or dependency_index
        >= len(model["dependencies"])
    ):
        return jsonify({
            "error": "Dependency not found."
        }), 404

    deleted = model[
        "dependencies"
    ].pop(dependency_index)

    save_json(path, model)

    return jsonify({
        "deleted": deleted
    })


# ---------------------------------------------------------
# SIMULATION
# ---------------------------------------------------------

@app.post("/api/simulate")
def simulate():
    body = (
        request.get_json(
            silent=True
        ) or {}
    )

    initial_failures = body.get(
        "initial_failures",
        []
    )

    model_id = body.get(
        "model_id"
    )

    if not isinstance(
        initial_failures,
        list
    ):
        return jsonify({
            "error": (
                "Initial failures must "
                "be a list."
            )
        }), 400

    if not initial_failures:
        return jsonify({
            "error": (
                "At least one initial "
                "failure is required."
            )
        }), 400

    if model_id:
        path = get_model_path(
            model_id
        )

        if not path.exists():
            return jsonify({
                "error": (
                    "Organization model "
                    "not found."
                )
            }), 404

        model = load_json(path)

    else:
        model = load_model()

    validation_error = (
        validate_model(model)
    )

    if validation_error:
        return jsonify({
            "error": (
                "The organization model "
                "is invalid."
            ),

            "details":
                validation_error,
        }), 400

    system_ids = {
        system["id"]
        for system in model["systems"]
    }

    unknown_failures = [
        system_id
        for system_id
        in initial_failures
        if system_id
        not in system_ids
    ]

    if unknown_failures:
        return jsonify({
            "error": (
                "Unknown systems."
            ),

            "systems":
                unknown_failures,
        }), 400

    result = simulate_failure(
        model,
        initial_failures
    )

    result["organization"] = (
        model["organization"]
    )

    return jsonify(result)


# ---------------------------------------------------------
# LIVE RESPONSE / REAL INCIDENTS
# ---------------------------------------------------------

LIVE_SYSTEM_STATES = {"failed", "degraded", "contained", "temporary_service", "restored", "verified"}

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def get_incident_path(incident_id):
    return INCIDENTS_DIR / f"{incident_id}.json"

def load_incident(incident_id):
    path = get_incident_path(incident_id)
    return load_json(path) if path.exists() else None

def save_incident(incident):
    save_json(get_incident_path(incident["id"]), incident)

def incident_system_snapshot(model):
    return [{
        "id": x.get("id"), "name": x.get("name"),
        "category": x.get("category"), "criticality": x.get("criticality")
    } for x in model.get("systems", [])]

def iso_to_datetime(value):
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

def minutes_between(start, end):
    start_dt = iso_to_datetime(start)
    end_dt = iso_to_datetime(end)
    if not start_dt or not end_dt:
        return None
    return round((end_dt - start_dt).total_seconds() / 60, 2)

def build_prediction_snapshot(incident, trigger_system_id, trigger_timestamp):
    baseline = incident.get("model_snapshot")
    if not baseline:
        return None

    simulation = simulate_failure(baseline, [trigger_system_id])
    return {
        "created_at": utc_now_iso(),
        "trigger_system_id": trigger_system_id,
        "trigger_timestamp": trigger_timestamp,
        "basis": "deterministic_model_at_incident_start",
        "events": simulation.get("events", []),
        "resilience_score": simulation.get("resilience_score"),
        "metrics": simulation.get("metrics", {}),
    }

def build_reality_diff(incident):
    prediction = incident.get("prediction_snapshot")
    observations = incident.get("observations", [])
    trigger_at = prediction.get("trigger_timestamp") if prediction else None
    ended_at = incident.get("ended_at")

    if not prediction or not trigger_at:
        return {
            "status": "insufficient_evidence",
            "generated_at": utc_now_iso(),
            "summary": {
                "matched": 0,
                "timing_mismatch": 0,
                "unexpected_observed": 0,
                "predicted_not_observed": 0,
            },
            "items": [],
            "note": "No confirmed failed/degraded trigger was recorded, so FRACTRA has no deterministic prediction to compare.",
        }

    predicted = {}
    for event in prediction.get("events", []):
        status = event.get("status")
        system_id = event.get("system")
        if status not in {"failed", "degraded"} or not system_id:
            continue
        time_minutes = float(event.get("time_minutes", 0) or 0)
        current = predicted.get(system_id)
        if current is None or time_minutes < current["time_minutes"]:
            predicted[system_id] = {
                "system_id": system_id,
                "status": status,
                "time_minutes": time_minutes,
                "caused_by": event.get("caused_by"),
                "dependency_type": event.get("dependency_type"),
            }

    observed = {}
    for obs in observations:
        if obs.get("state") not in {"failed", "degraded"}:
            continue
        system_id = obs.get("system_id")
        if not system_id or system_id in observed:
            continue
        observed_minutes = minutes_between(trigger_at, obs.get("timestamp"))
        if observed_minutes is None or observed_minutes < 0:
            continue
        observed[system_id] = {
            "system_id": system_id,
            "system_name": obs.get("system_name"),
            "state": obs.get("state"),
            "time_minutes": observed_minutes,
            "timestamp": obs.get("timestamp"),
        }

    baseline = incident.get("model_snapshot") or {}
    names = {
        system.get("id"): system.get("name", system.get("id"))
        for system in baseline.get("systems", [])
    }

    items = []
    tolerance_minutes = 1.0

    for system_id, actual in observed.items():
        expected = predicted.get(system_id)
        if expected is None:
            items.append({
                "type": "unexpected_observed",
                "system_id": system_id,
                "system_name": names.get(system_id, actual.get("system_name") or system_id),
                "expected": None,
                "observed": actual,
                "model_gap": "Observed impact was not present in the deterministic prediction. Review dependencies or assumptions.",
            })
            continue

        delta = round(actual["time_minutes"] - expected["time_minutes"], 2)
        mismatch = (
            abs(delta) > tolerance_minutes
            or actual["state"] != expected["status"]
        )
        items.append({
            "type": "timing_mismatch" if mismatch else "matched",
            "system_id": system_id,
            "system_name": names.get(system_id, system_id),
            "expected": expected,
            "observed": actual,
            "delta_minutes": delta,
            "model_gap": (
                "Observed timing/state differed from the model. Review delay, dependency, redundancy, or capacity assumptions."
                if mismatch else None
            ),
        })

    observed_window = minutes_between(trigger_at, ended_at)
    if observed_window is not None:
        for system_id, expected in predicted.items():
            if system_id in observed:
                continue
            # Only call it absent if reality was observed long enough for the
            # modelled event to have occurred.
            if expected["time_minutes"] <= observed_window:
                items.append({
                    "type": "predicted_not_observed",
                    "system_id": system_id,
                    "system_name": names.get(system_id, system_id),
                    "expected": expected,
                    "observed": None,
                    "model_gap": "The model predicted an impact within the observed incident window, but it was not confirmed in reality.",
                })

    summary = {
        "matched": sum(1 for item in items if item["type"] == "matched"),
        "timing_mismatch": sum(1 for item in items if item["type"] == "timing_mismatch"),
        "unexpected_observed": sum(1 for item in items if item["type"] == "unexpected_observed"),
        "predicted_not_observed": sum(1 for item in items if item["type"] == "predicted_not_observed"),
    }

    return {
        "status": "ready",
        "generated_at": utc_now_iso(),
        "trigger_system_id": prediction.get("trigger_system_id"),
        "trigger_timestamp": trigger_at,
        "observed_window_minutes": observed_window,
        "summary": summary,
        "items": items,
        "method": {
            "prediction": "FRACTRA deterministic engine using immutable incident-start model snapshot",
            "reality": "human-confirmed failed/degraded observations",
            "timing_tolerance_minutes": tolerance_minutes,
        },
    }

@app.post("/api/incidents")
def start_incident():
    body = request.get_json(silent=True) or {}
    model_id = str(body.get("model_id", "")).strip()
    name = str(body.get("name", "")).strip()
    incident_type = str(body.get("type", "other")).strip() or "other"
    note = str(body.get("note", "")).strip()

    if not model_id:
        return jsonify({"error": "model_id is required."}), 400
    path = get_model_path(model_id)
    if not path.exists():
        return jsonify({"error": "Organization model not found."}), 404
    if not name:
        return jsonify({"error": "Incident name is required."}), 400

    model = load_json(path)
    incident = {
        "id": f"inc-{uuid4().hex[:12]}",
        "model_id": model_id,
        "clerk_org_id": current_org_id(),
        "organization": {
            "id": model["organization"].get("id"),
            "name": model["organization"].get("name"),
        },
        "name": name,
        "type": incident_type,
        "status": "active",
        "started_at": utc_now_iso(),
        "ended_at": None,
        "note": note,
        "systems_snapshot": incident_system_snapshot(model),
        # Immutable baseline: what FRACTRA believed when the real incident began.
        "model_snapshot": json.loads(json.dumps(model)),
        "prediction_snapshot": None,
        "reality_diff": None,
        "observations": [],
        "actions": [],
    }
    save_incident(incident)
    return jsonify(incident), 201

@app.get("/api/incidents")
def list_incidents():
    model_id = request.args.get("model_id")
    incidents = []
    for path in INCIDENTS_DIR.glob("*.json"):
        try:
            incident = load_json(path)
        except (json.JSONDecodeError, OSError):
            continue
        if not incident_is_accessible(incident):
            continue
        if model_id and incident.get("model_id") != model_id:
            continue
        incidents.append({
            "id": incident.get("id"),
            "model_id": incident.get("model_id"),
            "organization": incident.get("organization"),
            "name": incident.get("name"),
            "type": incident.get("type"),
            "status": incident.get("status"),
            "started_at": incident.get("started_at"),
            "ended_at": incident.get("ended_at"),
            "observation_count": len(incident.get("observations", [])),
            "action_count": len(incident.get("actions", [])),
        })
    incidents.sort(key=lambda x: x.get("started_at") or "", reverse=True)
    return jsonify(incidents)

@app.get("/api/incidents/<incident_id>")
def get_incident(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    return jsonify(incident)

@app.post("/api/incidents/<incident_id>/observations")
def add_incident_observation(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "active":
        return jsonify({"error": "This incident has ended."}), 409

    body = request.get_json(silent=True) or {}
    system_id = str(body.get("system_id", "")).strip()
    state = str(body.get("state", "")).strip().lower()
    note = str(body.get("note", "")).strip()

    if state not in LIVE_SYSTEM_STATES:
        return jsonify({"error": "State must be failed, degraded, contained, temporary_service, restored, or verified."}), 400

    model_path = get_model_path(incident["model_id"])
    if not model_path.exists():
        return jsonify({"error": "Organization model not found."}), 404
    model = load_json(model_path)
    system = next((x for x in model.get("systems", []) if x.get("id") == system_id), None)
    if system is None:
        return jsonify({"error": "System not found in this organization."}), 400

    observation = {
        "id": f"obs-{uuid4().hex[:12]}",
        "timestamp": utc_now_iso(),
        "system_id": system_id,
        "system_name": system.get("name"),
        "state": state,
        "note": note,
        "source": "human_confirmed",
    }
    incident["observations"].append(observation)

    if (
        incident.get("prediction_snapshot") is None
        and state in {"failed", "degraded"}
    ):
        incident["prediction_snapshot"] = build_prediction_snapshot(
            incident,
            system_id,
            observation["timestamp"],
        )

    save_incident(incident)
    return jsonify(observation), 201

@app.post("/api/incidents/<incident_id>/actions")
def add_incident_action(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "active":
        return jsonify({"error": "This incident has ended."}), 409

    body = request.get_json(silent=True) or {}
    description = str(body.get("description", "")).strip()
    note = str(body.get("note", "")).strip()
    if not description:
        return jsonify({"error": "Action description is required."}), 400

    action = {
        "id": f"act-{uuid4().hex[:12]}",
        "timestamp": utc_now_iso(),
        "description": description,
        "note": note,
        "source": "human_recorded",
    }
    incident["actions"].append(action)
    save_incident(incident)
    return jsonify(action), 201

@app.post("/api/incidents/<incident_id>/end")
def end_incident(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") == "ended":
        return jsonify(incident)

    body = request.get_json(silent=True) or {}
    closing_note = str(body.get("note", "")).strip()
    incident["status"] = "ended"
    incident["ended_at"] = utc_now_iso()
    if closing_note:
        incident["closing_note"] = closing_note

    incident["reality_diff"] = build_reality_diff(incident)
    save_incident(incident)
    return jsonify(incident)

def editable_model_change(model, change):
    """Apply one human-reviewed structured change to a copy of the model."""
    updated = json.loads(json.dumps(model))
    kind = change.get("kind")

    if kind == "system_field":
        system_id = str(change.get("system_id", "")).strip()
        field = str(change.get("field", "")).strip()
        if field not in {"criticality", "standby", "max_runtime_minutes"}:
            raise ValueError("Unsupported system field.")
        system = next((x for x in updated.get("systems", []) if x.get("id") == system_id), None)
        if system is None:
            raise ValueError("Unknown system.")
        value = change.get("value")
        if field == "criticality":
            value = int(value)
            if value < 1 or value > 5:
                raise ValueError("Criticality must be between 1 and 5.")
        elif field == "standby":
            value = bool(value)
            if not value:
                system.pop("max_runtime_minutes", None)
        elif field == "max_runtime_minutes":
            value = int(value)
            if value <= 0:
                raise ValueError("Runtime must be greater than zero.")
            if not system.get("standby"):
                raise ValueError("Runtime can only be set on a standby system.")
        system[field] = value

    elif kind == "dependency_field":
        source = str(change.get("source", "")).strip()
        target = str(change.get("target", "")).strip()
        field = str(change.get("field", "")).strip()
        if field not in {"type", "failure_effect", "delay_minutes", "requirement_group"}:
            raise ValueError("Unsupported dependency field.")
        dep = next(
            (x for x in updated.get("dependencies", [])
             if x.get("source") == source and x.get("target") == target),
            None,
        )
        if dep is None:
            raise ValueError("Dependency not found.")
        value = change.get("value")
        if field == "delay_minutes":
            value = int(value)
            if value < 0:
                raise ValueError("Delay cannot be negative.")
        elif field == "failure_effect":
            if value not in {"failed", "degraded"}:
                raise ValueError("Failure effect must be failed or degraded.")
        elif field == "requirement_group":
            value = clean_requirement_group(value)
        dep[field] = value

    elif kind == "add_dependency":
        source = str(change.get("source", "")).strip()
        target = str(change.get("target", "")).strip()
        ids = {x.get("id") for x in updated.get("systems", [])}
        if source not in ids or target not in ids or source == target:
            raise ValueError("Invalid dependency endpoints.")
        if any(x.get("source") == source and x.get("target") == target for x in updated.get("dependencies", [])):
            raise ValueError("Dependency already exists.")
        dep = {
            "source": source,
            "target": target,
            "type": str(change.get("type", "service")).strip() or "service",
            "failure_effect": change.get("failure_effect", "failed"),
            "delay_minutes": int(change.get("delay_minutes", 1)),
        }
        group = clean_requirement_group(change.get("requirement_group"))
        if group:
            dep["requirement_group"] = group
        updated["dependencies"].append(dep)

    else:
        raise ValueError("Unsupported change kind.")

    validation_error = validate_model(updated)
    if validation_error:
        raise ValueError(validation_error)
    return updated


def build_gap_apertus_prompt(incident, item, correction_note=""):
    baseline = incident.get("model_snapshot") or {}
    sid = item.get("system_id")
    trigger_id = (incident.get("prediction_snapshot") or {}).get("trigger_system_id")

    # Give Apertus the real modeled neighborhood plus the initiating system.
    relevant_ids = {sid, trigger_id}
    deps = []
    for dependency in baseline.get("dependencies", []):
        if dependency.get("source") in relevant_ids or dependency.get("target") in relevant_ids:
            deps.append(dependency)
            relevant_ids.add(dependency.get("source"))
            relevant_ids.add(dependency.get("target"))

    systems = [
        system for system in baseline.get("systems", [])
        if system.get("id") in relevant_ids
    ]

    evidence = {
        "reality_diff_item": item,
        "trigger_system_id": trigger_id,
        "systems": systems,
        "dependencies": deps,
    }

    correction = (
        "\nPREVIOUS RESPONSE FAILED VALIDATION:\n" + correction_note
        if correction_note else ""
    )

    return """You are Apertus inside FRACTRA reviewing a deterministic Reality Diff.
The supplied prediction, observation, systems and dependencies are the ONLY evidence.

STRICT GROUNDING RULES:
- State only what the evidence shows.
- A hypothesis must be framed as a model assumption to TEST, not a real-world cause.
- Never invent or infer capacity, overload, bottlenecks, hardware faults, staffing,
  configuration errors, resource shortages, hidden systems, costs, regulations,
  recovery times, or physical causes unless explicitly present in EVIDENCE.
- Never say a dependency is "misconfigured". Say its modeled value may need review.
- Do not claim an unmodeled dependency exists. You may propose TESTING one between
  existing systems when the observation is not explained by the current model.
- Every proposed change is a counterfactual MODEL TEST, not a correction known to be true.
- Return proposed_changes when the evidence supports a concrete model test. FRACTRA will independently validate or construct executable tests.
- Proposed changes must involve the affected system directly.
- Use only existing system IDs from EVIDENCE.

Allowed structured tests:
1. dependency_field: edit type, failure_effect, delay_minutes, or requirement_group
   on an existing dependency touching the affected system.
2. add_dependency: test a new dependency between two EXISTING systems, with the
   affected system as source or target.
3. system_field: criticality, standby, or max_runtime_minutes ONLY when that exact
   field is already relevant to the supplied evidence for the affected system.

Return ONLY valid JSON:
{"explanation":"brief evidence-grounded explanation",
"hypotheses":[{"title":"...","reason":"..."}],
"proposed_changes":[{"title":"...","reason":"...","change":{"kind":"dependency_field|add_dependency|system_field","system_id":"optional","source":"optional","target":"optional","field":"optional","value":"optional","type":"optional","failure_effect":"optional","delay_minutes":"optional","requirement_group":"optional"}}]}

EVIDENCE:
""" + json.dumps(evidence, separators=(",", ":")) + correction


def construct_grounded_gap_tests(incident, item):
    """
    FRACTRA constructs executable tests from the frozen model itself.
    These are not claims about the cause; they are counterfactual tests.
    """
    baseline = incident.get("model_snapshot") or {}
    affected_id = item.get("system_id")
    trigger_id = (incident.get("prediction_snapshot") or {}).get("trigger_system_id")
    tests = []

    touching = [
        dep for dep in baseline.get("dependencies", [])
        if affected_id in {dep.get("source"), dep.get("target")}
    ]

    # Existing timing assumptions touching the affected system are directly testable.
    for dep in touching:
        current_delay = int(dep.get("delay_minutes", 1) or 0)
        # For an earlier-than-modelled observation, test a shorter local delay.
        # For a later observation, test a longer one. This is explicitly a test,
        # not a statement that the delay was wrong.
        delta = item.get("delta_minutes")
        if isinstance(delta, (int, float)):
            if delta < 0 and current_delay > 0:
                proposed_delay = 0
            elif delta > 0:
                proposed_delay = current_delay + max(1, int(round(delta)))
            else:
                proposed_delay = current_delay
        else:
            proposed_delay = current_delay

        if proposed_delay != current_delay:
            tests.append({
                "id": f"proposal-{uuid4().hex[:10]}",
                "title": "Test the modeled dependency timing",
                "reason": (
                    f"Reality differed from the prediction for {affected_id}. "
                    f"Test the existing {dep.get('source')} → {dep.get('target')} "
                    f"delay assumption without treating it as a proven cause."
                ),
                "change": {
                    "kind": "dependency_field",
                    "source": dep.get("source"),
                    "target": dep.get("target"),
                    "field": "delay_minutes",
                    "value": proposed_delay,
                },
                "constructed_by": "fractra_deterministic_review",
            })
            break

    # If the current graph cannot explain a very early/unexpected observation,
    # offer a structural counterfactual using only existing systems.
    if (
        not tests
        and trigger_id
        and affected_id
        and trigger_id != affected_id
        and not any(
            dep.get("source") == trigger_id and dep.get("target") == affected_id
            for dep in baseline.get("dependencies", [])
        )
    ):
        tests.append({
            "id": f"proposal-{uuid4().hex[:10]}",
            "title": "Test a direct dependency hypothesis",
            "reason": (
                f"Test whether a direct modeled relationship from {trigger_id} to "
                f"{affected_id} better reproduces the observed incident. "
                "This does not assert that the relationship exists in reality."
            ),
            "change": {
                "kind": "add_dependency",
                "source": trigger_id,
                "target": affected_id,
                "type": "service",
                "failure_effect": item.get("observed", {}).get("state", "failed"),
                "delay_minutes": max(
                    0,
                    int(round(item.get("observed", {}).get("time_minutes", 0) or 0)),
                ),
            },
            "constructed_by": "fractra_deterministic_review",
        })

    return tests[:2]


def validate_gap_review(payload, incident, item):
    baseline = incident.get("model_snapshot") or {}
    affected_id = item.get("system_id")
    forbidden = (
        "capacity", "overload", "bottleneck", "hardware fault", "staffing",
        "resource shortage", "misconfigured", "configuration error",
    )

    clean = {
        "explanation": str(payload.get("explanation", "")).strip(),
        "hypotheses": [],
        "proposed_changes": [],
    }

    # Unsupported causal language is not allowed through to the user.
    if any(term in clean["explanation"].lower() for term in forbidden):
        clean["explanation"] = (
            "The observed result differs from the deterministic model. "
            "The modeled relationships and timing assumptions touching this system should be reviewed."
        )

    for h in payload.get("hypotheses", [])[:3]:
        if not isinstance(h, dict) or not h.get("title") or not h.get("reason"):
            continue
        title = str(h["title"]).strip()
        reason = str(h["reason"]).strip()
        combined = f"{title} {reason}".lower()
        if any(term in combined for term in forbidden):
            continue
        clean["hypotheses"].append({"title": title, "reason": reason})

    for p in payload.get("proposed_changes", [])[:3]:
        if not isinstance(p, dict) or not isinstance(p.get("change"), dict):
            continue

        change = p["change"]
        kind = change.get("kind")

        # The proposed test must directly touch the system whose Reality Diff
        # is being reviewed. This prevents unrelated AI edits.
        if kind == "system_field":
            if change.get("system_id") != affected_id:
                continue
        elif kind in {"dependency_field", "add_dependency"}:
            if affected_id not in {change.get("source"), change.get("target")}:
                continue
        else:
            continue

        try:
            editable_model_change(baseline, change)
        except (ValueError, TypeError):
            continue

        title = str(p.get("title", "Proposed model test")).strip()
        reason = str(p.get("reason", "")).strip()
        combined = f"{title} {reason}".lower()
        if any(term in combined for term in forbidden):
            continue

        clean["proposed_changes"].append({
            "id": f"proposal-{uuid4().hex[:10]}",
            "title": title,
            "reason": reason,
            "change": change,
        })

    if not clean["proposed_changes"]:
        clean["proposed_changes"] = construct_grounded_gap_tests(incident, item)

    if not clean["proposed_changes"]:
        raise ValueError(
            "FRACTRA could not construct a safe executable model test for this gap."
        )

    return clean


@app.post("/api/incidents/<incident_id>/gaps/<int:item_index>/analyse")
def analyse_reality_gap(incident_id, item_index):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404

    diff = incident.get("reality_diff") or {}
    items = diff.get("items", [])
    if item_index < 0 or item_index >= len(items):
        return jsonify({"error": "Reality Diff item not found."}), 404

    item = items[item_index]
    if item.get("type") == "matched":
        return jsonify({"error": "Matched items do not require model-gap analysis."}), 400
    if not PUBLICAI_API_KEY:
        return jsonify({"error": "Apertus is not configured."}), 503

    correction_note = ""
    last_error = None

    # One automatic correction attempt is allowed. FRACTRA still refuses to
    # manufacture a proposal if Apertus cannot produce a grounded executable test.
    for attempt in range(2):
        messages = [
            {
                "role": "system",
                "content": (
                    "You are FRACTRA's grounded post-incident reasoning layer. "
                    "Never invent causes. Return executable model tests only."
                ),
            },
            {
                "role": "user",
                "content": build_gap_apertus_prompt(
                    incident,
                    item,
                    correction_note=correction_note,
                ),
            },
        ]

        try:
            response = call_apertus(messages, max_tokens=700)
            content = response["choices"][0]["message"]["content"]
            parsed = extract_apertus_json(content)
            review = validate_gap_review(parsed, incident, item)
            last_error = None
            break
        except (RuntimeError, KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as error:
            last_error = error
            correction_note = (
                "Your prior answer was rejected because it either used unsupported causal "
                "language or did not include a valid structured proposed change touching the "
                f"affected system {item.get('system_id')}. Return at least one grounded, "
                "executable model TEST using only the supplied systems/dependencies."
            )

    if last_error is not None:
        return jsonify({
            "error": "Apertus could not produce a grounded executable model test.",
            "details": str(last_error),
        }), 502

    incident.setdefault("gap_reviews", {})[str(item_index)] = {
        "status": "reviewed",
        "reviewed_at": utc_now_iso(),
        "analysis": review,
        "decisions": [],
        "grounding": "validated_against_incident_start_model",
    }
    save_incident(incident)
    return jsonify(incident["gap_reviews"][str(item_index)])


@app.post("/api/incidents/<incident_id>/gaps/<int:item_index>/decide")
def decide_reality_gap(incident_id, item_index):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    body = request.get_json(silent=True) or {}
    proposal_id = str(body.get("proposal_id", "")).strip()
    decision = str(body.get("decision", "")).strip()
    edited_change = body.get("change")
    if decision not in {"accepted", "rejected"}:
        return jsonify({"error": "Decision must be accepted or rejected."}), 400

    review = (incident.get("gap_reviews") or {}).get(str(item_index))
    if not review:
        return jsonify({"error": "Analyse this gap first."}), 409
    proposal = next(
        (p for p in review.get("analysis", {}).get("proposed_changes", []) if p.get("id") == proposal_id),
        None,
    )
    if proposal is None:
        return jsonify({"error": "Proposal not found."}), 404

    change = edited_change if isinstance(edited_change, dict) else proposal.get("change")
    if decision == "accepted":
        try:
            editable_model_change(incident.get("model_snapshot") or {}, change)
        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400

    decision_record = {
        "proposal_id": proposal_id,
        "decision": decision,
        "change": change if decision == "accepted" else None,
        "decided_at": utc_now_iso(),
        "source": "human_review",
    }
    review.setdefault("decisions", [])
    review["decisions"] = [x for x in review["decisions"] if x.get("proposal_id") != proposal_id]
    review["decisions"].append(decision_record)
    save_incident(incident)
    return jsonify(decision_record)


@app.post("/api/incidents/<incident_id>/model-branch")
def create_incident_model_branch(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "ended":
        return jsonify({"error": "End the incident before creating a model branch."}), 409

    accepted = []
    for review in (incident.get("gap_reviews") or {}).values():
        accepted.extend(
            d for d in review.get("decisions", [])
            if d.get("decision") == "accepted" and d.get("change")
        )
    if not accepted:
        return jsonify({"error": "Accept at least one reviewed model change first."}), 409

    base = json.loads(json.dumps(incident.get("model_snapshot") or {}))
    updated = base
    for decision in accepted:
        updated = editable_model_change(updated, decision["change"])

    org = updated.setdefault("organization", {})
    base_id = incident.get("model_id") or org.get("id") or "model"
    version_id = f"{base_id}-reality-{incident_id[-6:]}-{uuid4().hex[:4]}"
    org["id"] = version_id
    org["name"] = f"{org.get('name', base_id)} · Reality Branch"
    org["parent_model_id"] = base_id
    org["source_incident_id"] = incident_id
    org["version_type"] = "reality_calibrated_branch"
    org["created_at"] = utc_now_iso()

    path = get_model_path(version_id)
    save_json(path, updated)

    version_record = {
        "id": version_id,
        "parent_model_id": base_id,
        "incident_id": incident_id,
        "created_at": utc_now_iso(),
        "changes": accepted,
        "model_path": str(path.name),
    }
    save_json(VERSIONS_DIR / f"{version_id}.json", version_record)
    incident["approved_model_branch"] = version_record
    save_incident(incident)

    return jsonify({"model": updated, "version": version_record}), 201



def first_impact_by_system(simulation):
    impacts = {}
    for event in simulation.get("events", []):
        if event.get("status") not in {"failed", "degraded"} or not event.get("system"):
            continue
        t = float(event.get("time_minutes", 0) or 0)
        sid = event["system"]
        if sid not in impacts or t < impacts[sid]["time_minutes"]:
            impacts[sid] = {
                "system_id": sid,
                "status": event.get("status"),
                "time_minutes": t,
            }
    return impacts


@app.post("/api/incidents/<incident_id>/counterfactual-replay")
def counterfactual_replay(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "ended":
        return jsonify({"error": "End the incident before counterfactual replay."}), 409

    branch = incident.get("approved_model_branch")
    if not branch or not branch.get("id"):
        return jsonify({"error": "Create a reality-calibrated branch first."}), 409

    prediction = incident.get("prediction_snapshot") or {}
    trigger_id = prediction.get("trigger_system_id")
    if not trigger_id:
        return jsonify({"error": "This incident has no confirmed initiating disruption to replay."}), 409

    branch_model = load_model(branch["id"])
    baseline_model = incident.get("model_snapshot") or {}
    if not any(s.get("id") == trigger_id for s in branch_model.get("systems", [])):
        return jsonify({"error": "The initiating system is missing from the calibrated branch."}), 409

    # Same initiating disruption, two model versions. The deterministic engine
    # alone computes both outcomes.
    baseline_result = simulate_failure(baseline_model, [trigger_id])
    improved_result = simulate_failure(branch_model, [trigger_id])

    baseline_impacts = first_impact_by_system(baseline_result)
    improved_impacts = first_impact_by_system(improved_result)
    names = {
        s.get("id"): s.get("name", s.get("id"))
        for s in baseline_model.get("systems", [])
    }
    names.update({
        s.get("id"): s.get("name", s.get("id"))
        for s in branch_model.get("systems", [])
    })

    systems = []
    for sid in sorted(set(baseline_impacts) | set(improved_impacts)):
        old = baseline_impacts.get(sid)
        new = improved_impacts.get(sid)
        if old and new:
            delta = round(new["time_minutes"] - old["time_minutes"], 2)
            outcome = "delayed" if delta > 0 else "earlier" if delta < 0 else (
                "state_changed" if old["status"] != new["status"] else "unchanged"
            )
        elif old and not new:
            delta = None
            outcome = "prevented_in_model"
        else:
            delta = None
            outcome = "new_modelled_impact"

        systems.append({
            "system_id": sid,
            "system_name": names.get(sid, sid),
            "baseline": old,
            "counterfactual": new,
            "time_change_minutes": delta,
            "outcome": outcome,
        })

    actual = []
    trigger_at = prediction.get("trigger_timestamp")
    for obs in incident.get("observations", []):
        if obs.get("state") not in {"failed", "degraded"}:
            continue
        t = minutes_between(trigger_at, obs.get("timestamp"))
        if t is None or t < 0:
            continue
        actual.append({
            "system_id": obs.get("system_id"),
            "system_name": obs.get("system_name") or names.get(obs.get("system_id"), obs.get("system_id")),
            "state": obs.get("state"),
            "recorded_time_minutes": t,
        })

    score_old = baseline_result.get("resilience_score")
    score_new = improved_result.get("resilience_score")
    score_delta = None
    if isinstance(score_old, (int, float)) and isinstance(score_new, (int, float)):
        score_delta = round(score_new - score_old, 2)

    # Measure whether the calibrated branch actually reproduces recorded reality
    # more closely than the original model. This is a model-fit verdict, not a
    # real-world safety claim.
    actual_by_system = {x["system_id"]: x for x in actual}
    calibration_items = []
    improved_count = 0
    comparable_count = 0

    for sid, observed in actual_by_system.items():
        old = baseline_impacts.get(sid)
        new = improved_impacts.get(sid)
        observed_t = float(observed["recorded_time_minutes"])

        old_error = (
            round(abs(float(old["time_minutes"]) - observed_t), 2)
            if old else None
        )
        new_error = (
            round(abs(float(new["time_minutes"]) - observed_t), 2)
            if new else None
        )

        if old_error is not None and new_error is not None:
            comparable_count += 1
            if new_error < old_error:
                improved_count += 1

        calibration_items.append({
            "system_id": sid,
            "system_name": observed["system_name"],
            "observed_recorded_time_minutes": round(observed_t, 2),
            "baseline_time_error_minutes": old_error,
            "counterfactual_time_error_minutes": new_error,
            "error_reduction_minutes": (
                round(old_error - new_error, 2)
                if old_error is not None and new_error is not None else None
            ),
            "counterfactual_state": new.get("status") if new else None,
            "observed_state": observed.get("state"),
        })

    # A calibration is "sufficient" for this MVP only when every confirmed
    # failed/degraded observation is reproduced by the branch with the same
    # state and within one minute of its recorded time.
    tolerance_minutes = 1.0
    sufficient = bool(calibration_items) and all(
        item["counterfactual_time_error_minutes"] is not None
        and item["counterfactual_time_error_minutes"] <= tolerance_minutes
        and item["counterfactual_state"] == item["observed_state"]
        for item in calibration_items
    )

    calibration = {
        "verdict": "sufficient" if sufficient else "insufficient",
        "tolerance_minutes": tolerance_minutes,
        "confirmed_observations_checked": len(calibration_items),
        "comparable_observations": comparable_count,
        "observations_improved": improved_count,
        "items": calibration_items,
        "meaning": (
            "This verdict measures how closely the calibrated model reproduces "
            "the recorded incident observations. It is not a claim that the "
            "organisation is safe or that the model is proven correct."
        ),
    }

    result = {
        "status": "ready",
        "generated_at": utc_now_iso(),
        "method": "deterministic_counterfactual",
        "incident_id": incident_id,
        "incident_name": incident.get("name"),
        "trigger_system_id": trigger_id,
        "trigger_system_name": names.get(trigger_id, trigger_id),
        "baseline_model_id": incident.get("model_id"),
        "counterfactual_model_id": branch["id"],
        "basis": (
            "The same confirmed initiating disruption is replayed against the immutable "
            "incident-start model and the human-approved reality-calibrated branch."
        ),
        "actual_observations": actual,
        "baseline": {
            "resilience_score": score_old,
            "metrics": baseline_result.get("metrics", {}),
            "events": baseline_result.get("events", []),
        },
        "counterfactual": {
            "resilience_score": score_new,
            "metrics": improved_result.get("metrics", {}),
            "events": improved_result.get("events", []),
        },
        "comparison": {
            "resilience_score_change": score_delta,
            "failed_change": (
                improved_result.get("metrics", {}).get("failed_systems", 0)
                - baseline_result.get("metrics", {}).get("failed_systems", 0)
            ),
            "degraded_change": (
                improved_result.get("metrics", {}).get("degraded_systems", 0)
                - baseline_result.get("metrics", {}).get("degraded_systems", 0)
            ),
            "cascade_events_change": (
                improved_result.get("metrics", {}).get("cascade_events", 0)
                - baseline_result.get("metrics", {}).get("cascade_events", 0)
            ),
        },
        "systems": systems,
        "calibration": calibration,
        "interpretation": (
            "Counterfactual model result only. This does not claim what would happen "
            "in the real world."
        ),
    }

    incident["counterfactual_replay"] = result
    save_incident(incident)
    return jsonify(result)


@app.get("/api/incidents/<incident_id>/counterfactual-replay")
def get_counterfactual_replay(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    replay = incident.get("counterfactual_replay")
    if not replay:
        return jsonify({"error": "No counterfactual replay has been run yet."}), 404
    return jsonify(replay)



def calibration_version_number(incident):
    history = incident.get("calibration_history", [])
    return len(history) + 1


def calibration_tests_from_replay(incident):
    """
    Construct safe next-step counterfactual tests from the latest replay.
    These are model experiments, not claims about real-world causation.
    """
    replay = incident.get("counterfactual_replay") or {}
    calibration = replay.get("calibration") or {}
    branch = incident.get("approved_model_branch") or {}
    branch_id = branch.get("id")
    if not branch_id:
        raise ValueError("No calibrated branch exists.")

    model = load_model(branch_id)
    trigger_id = replay.get("trigger_system_id")
    tests = []

    for item in calibration.get("items", []):
        error = item.get("counterfactual_time_error_minutes")
        if error is None or error <= calibration.get("tolerance_minutes", 1.0):
            continue

        sid = item.get("system_id")
        observed_t = float(item.get("observed_recorded_time_minutes", 0) or 0)

        # Prefer a direct timing test on an existing dependency touching the
        # still-mismatched system.
        touching = [
            d for d in model.get("dependencies", [])
            if sid in {d.get("source"), d.get("target")}
        ]
        for dep in touching:
            current = int(dep.get("delay_minutes", 0) or 0)
            if current > 0:
                tests.append({
                    "id": f"iteration-{uuid4().hex[:10]}",
                    "system_id": sid,
                    "title": "Test a stronger timing adjustment",
                    "reason": (
                        f"The latest branch still differs from the recorded timing for {sid} "
                        f"by {round(error, 2)} minutes. Test another change to the existing "
                        f"{dep.get('source')} → {dep.get('target')} timing assumption."
                    ),
                    "change": {
                        "kind": "dependency_field",
                        "source": dep.get("source"),
                        "target": dep.get("target"),
                        "field": "delay_minutes",
                        "value": 0,
                    },
                    "source": "fractra_counterfactual_measurement",
                })
                break

        # If local delay is already exhausted and the incident is still far
        # earlier than the model, test a structural path using existing systems.
        if not any(t["system_id"] == sid for t in tests) and trigger_id and trigger_id != sid:
            exists = any(
                d.get("source") == trigger_id and d.get("target") == sid
                for d in model.get("dependencies", [])
            )
            if not exists:
                tests.append({
                    "id": f"iteration-{uuid4().hex[:10]}",
                    "system_id": sid,
                    "title": "Test a shorter causal path",
                    "reason": (
                        f"Removing local delay is not enough to reproduce the recorded timing "
                        f"for {sid}. Test whether a direct modeled path from the initiating "
                        f"system better reproduces this incident. This does not assert that "
                        f"the dependency exists in reality."
                    ),
                    "change": {
                        "kind": "add_dependency",
                        "source": trigger_id,
                        "target": sid,
                        "type": "service",
                        "failure_effect": item.get("observed_state") or "failed",
                        "delay_minutes": max(0, int(round(observed_t))),
                    },
                    "source": "fractra_counterfactual_measurement",
                })

    # Validate every test against the CURRENT branch, not the original model.
    valid = []
    for test in tests[:3]:
        try:
            editable_model_change(model, test["change"])
            valid.append(test)
        except (ValueError, TypeError):
            continue
    return valid


@app.get("/api/incidents/<incident_id>/calibration/next")
def next_calibration_tests(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404

    replay = incident.get("counterfactual_replay") or {}
    calibration = replay.get("calibration") or {}
    if calibration.get("verdict") != "insufficient":
        return jsonify({
            "status": "not_needed",
            "message": "The latest replay is not marked calibration-insufficient.",
            "tests": [],
        })

    try:
        tests = calibration_tests_from_replay(incident)
    except ValueError as error:
        return jsonify({"error": str(error)}), 409

    return jsonify({
        "status": "review_required" if tests else "no_safe_test",
        "version": calibration_version_number(incident),
        "current_branch_id": (incident.get("approved_model_branch") or {}).get("id"),
        "tests": tests,
        "note": (
            "These are counterfactual model tests derived from remaining prediction error. "
            "They are not claims about real-world causation."
        ),
    })


@app.post("/api/incidents/<incident_id>/calibration/apply")
def apply_calibration_iteration(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "ended":
        return jsonify({"error": "End the incident before calibration."}), 409

    current_branch = incident.get("approved_model_branch") or {}
    parent_id = current_branch.get("id")
    if not parent_id:
        return jsonify({"error": "Create the first reality-calibrated branch in AFTER."}), 409

    body = request.get_json(silent=True) or {}
    change = body.get("change")
    if not isinstance(change, dict):
        return jsonify({"error": "A structured model change is required."}), 400

    current_model = load_model(parent_id)
    try:
        updated = editable_model_change(current_model, change)
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400

    version_no = calibration_version_number(incident)
    base_id = (incident.get("model_id") or "model").split("-reality-")[0]
    new_id = f"{base_id}-reality-v{version_no}-{uuid4().hex[:4]}"

    updated.setdefault("organization", {})
    updated["organization"]["id"] = new_id
    original_name = updated["organization"].get("name", "Organisation").split(" · Reality Branch")[0]
    updated["organization"]["name"] = f"{original_name} · Reality Branch v{version_no}"
    updated["organization"]["parent_model_id"] = parent_id
    updated["organization"]["source_incident_id"] = incident_id
    updated["organization"]["version_type"] = "iterative_reality_calibration"
    updated["organization"]["calibration_version"] = version_no
    updated["organization"]["created_at"] = utc_now_iso()

    validate_model(updated)
    save_model(updated)

    history_entry = {
        "version": version_no,
        "model_id": new_id,
        "parent_model_id": parent_id,
        "created_at": utc_now_iso(),
        "change": change,
        "source_replay_generated_at": (incident.get("counterfactual_replay") or {}).get("generated_at"),
    }
    incident.setdefault("calibration_history", []).append(history_entry)
    incident["approved_model_branch"] = {
        "id": new_id,
        "parent_model_id": parent_id,
        "version": version_no,
        "created_at": history_entry["created_at"],
    }
    # Force a fresh replay; never display the previous branch result as current.
    incident["counterfactual_replay"] = None
    save_incident(incident)

    return jsonify({
        "status": "created",
        "branch": incident["approved_model_branch"],
        "history": incident["calibration_history"],
        "message": "New calibration branch created. Replay the incident to measure it.",
    })


@app.get("/api/incidents/<incident_id>/calibration/history")
def calibration_history(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    return jsonify({
        "history": incident.get("calibration_history", []),
        "current_branch": incident.get("approved_model_branch"),
    })



def mitigation_tests_from_calibrated_model(incident):
    """
    Construct only model-grounded resilience experiments from the CURRENT calibrated
    model. Do not infer semantic compatibility between unrelated systems merely
    because both nodes exist in the graph.
    """
    replay = incident.get("counterfactual_replay") or {}
    calibration = replay.get("calibration") or {}
    if calibration.get("verdict") != "sufficient":
        raise ValueError("Reach calibration sufficiency before testing mitigations.")

    branch_id = (incident.get("approved_model_branch") or {}).get("id")
    if not branch_id:
        raise ValueError("No calibrated branch exists.")

    model = load_model(branch_id)
    impacts = first_impact_by_system(replay.get("counterfactual") or {})
    tests = []

    # Grounded intervention: a standby system already has an explicit runtime
    # property in the model, so changing it is a legitimate counterfactual.
    for sid, impact in impacts.items():
        system = next((s for s in model.get("systems", []) if s.get("id") == sid), None)
        if not system or not system.get("standby"):
            continue
        runtime = system.get("max_runtime_minutes")
        if not isinstance(runtime, (int, float)) or runtime <= 0:
            continue

        change = {
            "kind": "system_field",
            "system_id": sid,
            "field": "max_runtime_minutes",
            "value": int(runtime) + 60,
        }
        try:
            editable_model_change(model, change)
        except (ValueError, TypeError):
            continue

        tests.append({
            "id": f"mitigation-{uuid4().hex[:10]}",
            "title": "Test longer standby runtime",
            "system_id": sid,
            "reason": (
                f"{system.get('name', sid)} is an existing modeled standby resource "
                f"with a {runtime}-minute runtime and is exhausted in this replay. "
                f"Test whether 60 additional modeled minutes changes the outcome or "
                f"buys additional response time."
            ),
            "change": change,
            "source": "fractra_grounded_mitigation",
            "warning": (
                "This is a post-incident model experiment. It does not claim that "
                "the additional runtime is feasible until a human verifies implementation."
            ),
        })

    return tests[:3]


def event_impact_times(result):
    """First failed/degraded time per system from a deterministic engine result."""
    impacts = {}
    for event in (result or {}).get("events", []):
        sid = event.get("system_id") or event.get("system")
        status = event.get("status")
        if not sid or status not in {"failed", "degraded"}:
            continue
        raw = event.get("time_minutes", event.get("time", 0))
        try:
            t = float(raw or 0)
        except (TypeError, ValueError):
            t = 0.0
        existing = impacts.get(sid)
        if existing is None or t < existing["time_minutes"]:
            impacts[sid] = {"status": status, "time_minutes": t}
    return impacts


def response_window_comparison(before, after):
    """
    Measure deterministic time bought before the same modeled impact.
    This is separate from final-state resilience.
    """
    before_impacts = event_impact_times(before)
    after_impacts = event_impact_times(after)
    rows = []
    gains = []

    for sid, original in before_impacts.items():
        revised = after_impacts.get(sid)
        if revised is None:
            # A prevented impact is outcome improvement, handled separately.
            continue
        gain = round(revised["time_minutes"] - original["time_minutes"], 2)
        if gain > 0:
            gains.append(gain)
            rows.append({
                "system_id": sid,
                "before_minutes": round(original["time_minutes"], 2),
                "after_minutes": round(revised["time_minutes"], 2),
                "minutes_bought": gain,
                "status_before": original["status"],
                "status_after": revised["status"],
            })

    return {
        "systems": rows,
        "max_minutes_bought": max(gains) if gains else 0,
        "min_positive_minutes_bought": min(gains) if gains else 0,
        "systems_with_more_time": len(rows),
    }


@app.get("/api/incidents/<incident_id>/mitigation/tests")
def get_mitigation_tests(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    try:
        tests = mitigation_tests_from_calibrated_model(incident)
    except ValueError as error:
        return jsonify({"error": str(error)}), 409
    tests = [
        test for test in tests
        if test.get("source") == "fractra_grounded_mitigation"
        and test.get("title") != "Test an alternate provider path"
    ]
    return jsonify({"tests": tests})


@app.post("/api/incidents/<incident_id>/mitigation/test")
def test_mitigation(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404

    replay = incident.get("counterfactual_replay") or {}
    if (replay.get("calibration") or {}).get("verdict") != "sufficient":
        return jsonify({"error": "Calibrate the model sufficiently first."}), 409

    body = request.get_json(silent=True) or {}
    changes = body.get("changes")
    if not isinstance(changes, list):
        single = body.get("change")
        changes = [single] if isinstance(single, dict) else []
    if not changes or not all(isinstance(change, dict) for change in changes):
        return jsonify({"error": "A structured mitigation test is required."}), 400

    branch_id = (incident.get("approved_model_branch") or {}).get("id")
    calibrated = load_model(branch_id)
    candidate = json.loads(json.dumps(calibrated))
    try:
        for change in changes:
            candidate = editable_model_change(candidate, change)
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400

    trigger_id = replay.get("trigger_system_id")
    before = simulate_failure(calibrated, [trigger_id])
    after = simulate_failure(candidate, [trigger_id])

    before_score = before.get("resilience_score")
    after_score = after.get("resilience_score")
    response_window = response_window_comparison(before, after)
    score_change = (
        round(after_score - before_score, 2)
        if isinstance(before_score, (int, float)) and isinstance(after_score, (int, float))
        else None
    )

    result = {
        "id": f"mitigation-result-{uuid4().hex[:10]}",
        "tested_at": utc_now_iso(),
        "changes": changes,
        "baseline_model_id": branch_id,
        "trigger_system_id": trigger_id,
        "before": {
            "resilience_score": before_score,
            "metrics": before.get("metrics", {}),
            "events": before.get("events", []),
        },
        "after": {
            "resilience_score": after_score,
            "metrics": after.get("metrics", {}),
            "events": after.get("events", []),
        },
        "comparison": {
            "resilience_score_change": score_change,
            "failed_systems_change": after.get("metrics", {}).get("failed_systems", 0) - before.get("metrics", {}).get("failed_systems", 0),
            "degraded_systems_change": after.get("metrics", {}).get("degraded_systems", 0) - before.get("metrics", {}).get("degraded_systems", 0),
            "duration_change_minutes": after.get("metrics", {}).get("duration_minutes", 0) - before.get("metrics", {}).get("duration_minutes", 0),
        },
        "response_window": response_window,
        "verdict": (
            "outcome_improved"
            if (
                (score_change is not None and score_change > 0)
                or after.get("metrics", {}).get("failed_systems", 0) < before.get("metrics", {}).get("failed_systems", 0)
                or after.get("metrics", {}).get("degraded_systems", 0) < before.get("metrics", {}).get("degraded_systems", 0)
            )
            else (
                "response_window_improved"
                if response_window.get("systems_with_more_time", 0) > 0
                else "no_measured_improvement"
            )
        ),
        "meaning": (
            "Outcome improvement means fewer/worse final impacts or a higher final resilience score. "
            "Response-window improvement means the final modeled damage may be unchanged, but the "
            "deterministic cascade reaches affected systems later. Neither is proof of real-world effectiveness."
        ),
    }
    incident.setdefault("mitigation_tests", []).append(result)
    save_incident(incident)
    return jsonify(result)


@app.post("/api/incidents/<incident_id>/mitigation/apply")
def apply_mitigation(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404

    body = request.get_json(silent=True) or {}
    result_id = body.get("result_id")
    result = next(
        (r for r in incident.get("mitigation_tests", []) if r.get("id") == result_id),
        None,
    )
    if result is None:
        return jsonify({"error": "Mitigation test result not found."}), 404
    if result.get("verdict") not in {"outcome_improved", "response_window_improved"}:
        return jsonify({"error": "Only a mitigation with measured deterministic improvement can be promoted."}), 409

    parent_id = (incident.get("approved_model_branch") or {}).get("id")
    model = load_model(parent_id)
    try:
        improved = model
        for change in result.get("changes", []):
            improved = editable_model_change(improved, change)
    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400

    new_id = f"{parent_id}-resilience-{uuid4().hex[:4]}"
    improved.setdefault("organization", {})
    improved["organization"]["id"] = new_id
    base_name = improved["organization"].get("name", "Organisation").split(" · Resilience")[0]
    improved["organization"]["name"] = f"{base_name} · Resilience Improvement"
    improved["organization"]["parent_model_id"] = parent_id
    improved["organization"]["source_incident_id"] = incident_id
    improved["organization"]["version_type"] = "resilience_improvement"
    improved["organization"]["created_at"] = utc_now_iso()
    validate_model(improved)
    save_model(improved)

    record = {
        "model_id": new_id,
        "parent_model_id": parent_id,
        "created_at": utc_now_iso(),
        "result_id": result_id,
        "changes": result.get("changes", []),
        "measured_comparison": result["comparison"],
    }
    incident.setdefault("resilience_improvements", []).append(record)
    incident["improved_resilience_branch"] = record
    save_incident(incident)
    return jsonify({"status": "created", "branch": record})


@app.get("/api/incidents/<incident_id>/reality-diff")
def get_reality_diff(incident_id):
    incident = load_incident(incident_id)
    if incident is None:
        return jsonify({"error": "Incident not found."}), 404
    if incident.get("status") != "ended":
        return jsonify({"error": "Reality Diff is available after the incident ends."}), 409

    if not incident.get("reality_diff"):
        incident["reality_diff"] = build_reality_diff(incident)
        save_incident(incident)

    return jsonify(incident["reality_diff"])


# ---------------------------------------------------------
# APERTUS REASONING LAYER
# ---------------------------------------------------------

def build_apertus_prompt(model, simulation):
    """
    Build a compact evidence package from the verified deterministic result.
    FRACTRA still simulates the full model; Apertus receives only systems and
    dependencies relevant to the verified cascade.
    """
    events = simulation.get("events", [])
    all_systems = model.get("systems", [])
    all_dependencies = model.get("dependencies", [])

    relevant_ids = set()

    # Systems explicitly present in verified events are relevant.
    for event in events:
        for key in ("system_id", "system", "source", "target"):
            value = event.get(key)
            if isinstance(value, str) and value:
                relevant_ids.add(value)

    # Final non-stable systems are relevant.
    for system in simulation.get("systems", []):
        if system.get("status") in {"failed", "degraded"}:
            system_id = system.get("id")
            if system_id:
                relevant_ids.add(system_id)

    # Include direct providers/targets touching the verified cascade so
    # redundancy can be reasoned about without sending the entire graph.
    changed = True
    while changed:
        changed = False
        for dependency in all_dependencies:
            source = dependency.get("source")
            target = dependency.get("target")
            if source in relevant_ids or target in relevant_ids:
                before = len(relevant_ids)
                if source:
                    relevant_ids.add(source)
                if target:
                    relevant_ids.add(target)
                if len(relevant_ids) != before:
                    changed = True

    compact_systems = []
    for system in all_systems:
        if system.get("id") not in relevant_ids:
            continue
        compact = {
            "id": system.get("id"),
            "name": system.get("name"),
            "criticality": system.get("criticality"),
            "standby": bool(system.get("standby", False)),
        }
        if system.get("max_runtime_minutes") is not None:
            compact["max_runtime_minutes"] = system.get("max_runtime_minutes")
        compact_systems.append(compact)

    compact_dependencies = [
        {
            key: dependency.get(key)
            for key in (
                "source",
                "target",
                "type",
                "failure_effect",
                "delay_minutes",
                "requirement_group",
            )
            if dependency.get(key) is not None
        }
        for dependency in all_dependencies
        if dependency.get("source") in relevant_ids
        and dependency.get("target") in relevant_ids
    ]

    compact_events = []
    for event in events:
        compact_events.append({
            key: event.get(key)
            for key in (
                "time_minutes",
                "system_id",
                "system",
                "status",
                "cause",
                "source",
                "target",
                "dependency_type",
                "reason",
            )
            if event.get(key) is not None
        })

    evidence = {
        "systems": compact_systems,
        "dependencies": compact_dependencies,
        "verified_events": compact_events,
        "metrics": simulation.get("metrics", {}),
        "resilience_score": simulation.get("resilience_score"),
    }

    rules = """
You are Apertus inside FRACTRA.
FRACTRA's deterministic engine is the sole authority for outcomes.

Return ONLY valid JSON with keys:
summary, cascade_explanation, hidden_vulnerabilities,
single_points_of_failure, mitigations.

Rules:
- Use only supplied evidence. Never invent recovery, outage duration, causes,
  systems, dependencies, capacities, costs, regulations or outcomes.
- Follow verified_events exactly. Do not recalculate or extend the cascade.
- max_runtime_minutes is only configured runtime. If an exhaustion event exists,
  say that configured runtime was exhausted.
- A redundant provider is not automatically a single point of failure.
- Mitigations are hypotheses only. Never promise prevention, a better score,
  or improved resilience before FIX + REPLAY.
- When the verified cascade contains a directly editable contributing field,
  return at least one mitigation that tests that field.
- Use only existing system IDs.
- Recommend only editable FRACTRA fields: system criticality, standby,
  max_runtime_minutes; dependency source, target, type, failure_effect,
  delay_minutes, requirement_group.
- For a system-field mitigation, target_system_id MUST be the exact existing
  system ID and test MUST literally name the editable field.
- For max_runtime_minutes, state the current verified value and a concrete
  proposed test value. Example form:
  "Change backup-power.max_runtime_minutes from 60 to 120."
- For a dependency-field mitigation, target_system_id must be null and test
  must literally name the dependency field being changed.
- Do not append predicted outcomes to test. FRACTRA measures the result.
- Keep the response concise: normally 0-3 items per array.

JSON shape:
{"summary":"...","cascade_explanation":"...",
"hidden_vulnerabilities":[{"title":"...","explanation":"..."}],
"single_points_of_failure":[{"system_id":"...","reason":"..."}],
"mitigations":[{"title":"...","target_system_id":"... or null",
"reason":"...","test":"..."}]}
"""

    return (
        rules
        + "\nVERIFIED FRACTRA EVIDENCE:\n"
        + json.dumps(evidence, separators=(",", ":"))
    )


def extract_apertus_json(content):
    """
    Parse the model's JSON response. No fabricated fallback is generated.
    """
    text = str(content or "").strip()

    if text.startswith("```"):
        text = re.sub(
            r"^```(?:json)?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        first = text.find("{")
        last = text.rfind("}")

        if first != -1 and last > first:
            return json.loads(text[first:last + 1])

        raise



def validate_apertus_analysis(analysis, model, simulation, initial_failures):
    """Validate AI recommendations against the real FRACTRA model."""
    if not isinstance(analysis, dict):
        raise ValueError("Apertus analysis must be a JSON object.")

    systems = model.get("systems", [])
    dependencies = model.get("dependencies", [])
    system_ids = {x.get("id") for x in systems if x.get("id")}

    cleaned = {
        "summary": str(analysis.get("summary", "")).strip(),
        "cascade_explanation": str(analysis.get("cascade_explanation", "")).strip(),
        "hidden_vulnerabilities": [],
        "single_points_of_failure": [],
        "mitigations": [],
    }

    for item in analysis.get("hidden_vulnerabilities", []):
        if isinstance(item, dict):
            title = str(item.get("title", "")).strip()
            explanation = str(item.get("explanation", "")).strip()
            if title and explanation:
                cleaned["hidden_vulnerabilities"].append(
                    {"title": title, "explanation": explanation}
                )

    def supports_spof(system_id):
        for dep in dependencies:
            if dep.get("source") != system_id:
                continue
            target = dep.get("target")
            group = dep.get("requirement_group")
            if group:
                alternatives = [
                    other for other in dependencies
                    if other.get("target") == target
                    and other.get("requirement_group") == group
                    and other.get("source") != system_id
                ]
            else:
                alternatives = [
                    other for other in dependencies
                    if other.get("target") == target
                    and other.get("source") != system_id
                    and other.get("requirement_group") is None
                ]
            if not alternatives:
                return True
        return False

    for item in analysis.get("single_points_of_failure", []):
        if not isinstance(item, dict):
            continue
        sid = str(item.get("system_id", "")).strip()
        reason = str(item.get("reason", "")).strip()
        if sid in system_ids and reason and supports_spof(sid):
            cleaned["single_points_of_failure"].append(
                {"system_id": sid, "reason": reason}
            )

    system_fields = ("criticality", "standby", "max_runtime_minutes")
    dependency_fields = (
        "source", "target", "type", "failure_effect",
        "delay_minutes", "requirement_group",
    )

    for item in analysis.get("mitigations", []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        target = item.get("target_system_id")
        reason = str(item.get("reason", "")).strip()
        test = str(item.get("test", "")).strip()

        if target is not None:
            target = str(target).strip()
            if target not in system_ids:
                continue

        if not title or not reason or not test:
            continue

        lower_test = test.lower()
        allowed = system_fields if target is not None else dependency_fields
        if not any(field in lower_test for field in allowed):
            continue

        reason = re.sub(
            r"\b(?:will|would) (prevent|improve|ensure|avoid|stop|increase)\b",
            r"may \1",
            reason,
            flags=re.IGNORECASE,
        )

        test = re.sub(
            r"\b(?:and\s+)?(?:re-?run|replay).*$",
            "and use FIX + REPLAY to measure the effect.",
            test,
            flags=re.IGNORECASE,
        )
        test = re.sub(
            r"\bverify improved resilience score\b",
            "measure the effect with FIX + REPLAY",
            test,
            flags=re.IGNORECASE,
        )

        cleaned["mitigations"].append({
            "title": title,
            "target_system_id": target,
            "reason": reason,
            "test": test,
        })

    return cleaned

def call_apertus(messages, max_tokens=700):
    """Call Public AI directly with Python's built-in urllib transport."""
    request_payload = {
        "model": APERTUS_MODEL,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }

    body = json.dumps(request_payload).encode("utf-8")
    req = urllib.request.Request(
        f"{PUBLICAI_BASE_URL}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {PUBLICAI_API_KEY}",
            "User-Agent": "FRACTRA/1.0",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=75) as response:
            raw = response.read().decode("utf-8")

    except urllib.error.HTTPError as error:
        try:
            details = error.read().decode("utf-8", errors="replace")
        except Exception:
            details = ""
        raise RuntimeError(
            f"Public AI HTTP {error.code}: {details[:1000] or error.reason}"
        ) from error

    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Public AI connection failed: {error.reason}"
        ) from error

    except TimeoutError as error:
        raise RuntimeError(
            "Public AI request timed out."
        ) from error

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            "Public AI returned invalid JSON."
        ) from error

    return payload


@app.get("/api/apertus/health")
def apertus_health():
    if not PUBLICAI_API_KEY:
        return jsonify({
            "status": "not_configured",
            "error": "PUBLICAI_API_KEY was not loaded.",
        }), 503

    try:
        response = requests.get(
            f"{PUBLICAI_BASE_URL}/models",
            headers={
                "Authorization": f"Bearer {PUBLICAI_API_KEY}",
                "User-Agent": "FRACTRA/1.0",
            },
            timeout=30,
        )
        response.raise_for_status()

        available_models = {
            item.get("id")
            for item in response.json().get("data", [])
            if item.get("id")
        }

        if APERTUS_MODEL not in available_models:
            return jsonify({
                "status": "model_unavailable",
                "model": APERTUS_MODEL,
            }), 503

        return jsonify({
            "status": "ready",
            "provider": "Public AI",
            "model": APERTUS_MODEL,
        })

    except requests.RequestException as error:
        return jsonify({
            "status": "provider_error",
            "error": str(error),
        }), 502



def extract_json_object(text):
    """Extract one JSON object from an LLM response without trusting surrounding prose."""
    if not isinstance(text, str):
        raise ValueError("Apertus returned no usable text.")
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("Apertus did not return structured JSON.")
        return json.loads(match.group(0))


def aperture_message_text(payload):
    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise ValueError("Apertus returned an unexpected response shape.")


def deterministic_stress_candidates(model):
    """
    Calculate model-grounded candidate initiators without AI.
    Ranking is structural only: criticality + downstream reach.
    """
    systems = model.get("systems", [])
    dependencies = model.get("dependencies", [])
    outgoing = {}
    for dep in dependencies:
        outgoing.setdefault(dep.get("source"), []).append(dep.get("target"))

    def reach(start):
        seen = set()
        queue = list(outgoing.get(start, []))
        while queue:
            sid = queue.pop(0)
            if sid in seen:
                continue
            seen.add(sid)
            queue.extend(outgoing.get(sid, []))
        return len(seen)

    ranked = []
    for system in systems:
        sid = system.get("id")
        if not sid:
            continue
        ranked.append({
            "system_id": sid,
            "name": system.get("name", sid),
            "category": system.get("category", "general"),
            "criticality": int(system.get("criticality", 1) or 1),
            "downstream_reach": reach(sid),
            "standby": bool(system.get("standby", False)),
        })

    ranked.sort(
        key=lambda item: (
            item["downstream_reach"],
            item["criticality"],
            not item["standby"],
        ),
        reverse=True,
    )
    return ranked[:6]


@app.post("/api/apertus/break-me")
def break_me():
    """
    Apertus chooses ONE existing initiating system.
    FRACTRA, not the LLM, constructs all user-visible grounding text
    from deterministic structural facts in the current model.
    """
    if not PUBLICAI_API_KEY:
        return jsonify({"error": "Apertus is not configured on the server."}), 503

    body = request.get_json(silent=True) or {}
    model_id = body.get("model_id")
    if not model_id:
        return jsonify({"error": "model_id is required."}), 400

    path = get_model_path(model_id)
    if not path.exists():
        return jsonify({"error": "Organization model not found."}), 404

    model = load_json(path)
    validation_error = validate_model(model)
    if validation_error:
        return jsonify({
            "error": "The organization model is invalid.",
            "details": validation_error,
        }), 400

    candidates = deterministic_stress_candidates(model)
    if not candidates:
        return jsonify({"error": "This model has no systems to stress-test."}), 409

    compact_dependencies = [
        {
            "source": d.get("source"),
            "target": d.get("target"),
            "type": d.get("type", "service"),
            "failure_effect": d.get("failure_effect", "failed"),
            "delay_minutes": d.get("delay_minutes", 1),
            "requirement_group": d.get("requirement_group"),
        }
        for d in model.get("dependencies", [])
    ]

    # Apertus has one narrow job: select an existing candidate.
    messages = [
        {
            "role": "system",
            "content": (
                "You are FRACTRA's challenge selector. Select ONE initiating "
                "system worth stress-testing from candidate_systems. You may "
                "ONLY return a listed system_id. Do not explain consequences, "
                "do not predict downstream failures, and do not add real-world "
                "domain assumptions. Return JSON only: {\"system_id\":\"...\"}."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({
                "organization": model.get("organization", {}),
                "candidate_systems": candidates,
                "dependencies": compact_dependencies,
            }, indent=2),
        },
    ]

    try:
        raw = call_apertus(messages, max_tokens=80)
        proposal = extract_json_object(aperture_message_text(raw))
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 502

    allowed = {item["system_id"]: item for item in candidates}
    chosen = proposal.get("system_id")

    # Apertus can never inject a nonexistent initiator.
    if chosen not in allowed:
        chosen = candidates[0]["system_id"]

    facts = allowed[chosen]
    name = facts["name"]
    reach = facts["downstream_reach"]
    criticality = facts["criticality"]
    standby = facts["standby"]

    # All visible prose below is generated by FRACTRA from verified model facts.
    challenge = f"What happens if {name} becomes unavailable?"

    reasons = [
        f"{name} has modeled criticality {criticality}/5",
        f"and reaches {reach} downstream system{'s' if reach != 1 else ''} "
        "through the current dependency graph",
    ]
    if standby:
        reasons.append(
            "It is also explicitly modeled as a standby resource"
        )

    why_test = ". ".join(reasons) + (
        ". This makes it a structurally significant initiating disruption "
        "to test. No downstream outcome is assumed here."
    )

    return jsonify({
        "system_id": chosen,
        "system_name": name,
        "challenge": challenge,
        "why_test": why_test,
        "grounding": {
            "criticality": criticality,
            "downstream_reach": reach,
            "standby": standby,
        },
        "selection_authority": "Apertus",
        "explanation_authority": "FRACTRA deterministic model facts",
        "authority": (
            "Apertus selected the initiating disruption only. "
            "FRACTRA generated this explanation from the current model. "
            "The deterministic engine has not calculated the cascade yet."
        ),
    })




def clean_apertus_model_proposal(proposal, organization_name, organization_type):
    """
    Convert Apertus output into a reviewable semantic draft.
    Organisation/container is never a system.
    Provider -> consumer is the only dependency direction.
    """
    if not isinstance(proposal, dict):
        raise ValueError("Apertus did not return a model object.")

    raw_systems = proposal.get("systems", [])
    raw_dependencies = proposal.get("dependencies", [])

    if not isinstance(raw_systems, list) or not raw_systems:
        raise ValueError("Apertus did not propose any systems.")
    if not isinstance(raw_dependencies, list):
        raise ValueError("Apertus dependencies must be a list.")

    org_norm = re.sub(r"[^a-z0-9]+", " ", organization_name.lower()).strip()
    systems = []
    used_ids = set()

    for item in raw_systems[:20]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue

        # The organisation is the container, never a graph node.
        name_norm = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
        if name_norm == org_norm:
            continue

        sid = slugify(str(item.get("id") or name))
        if not sid:
            continue
        base = sid
        n = 2
        while sid in used_ids:
            sid = f"{base}-{n}"
            n += 1
        used_ids.add(sid)

        try:
            criticality = max(1, min(5, int(item.get("criticality", 3))))
        except (TypeError, ValueError):
            criticality = 3

        standby = bool(item.get("standby", False))
        system = {
            "id": sid,
            "name": name[:100],
            "category": str(item.get("category", "general")).strip()[:80] or "general",
            "criticality": criticality,
            "standby": standby,
        }

        runtime = item.get("max_runtime_minutes")
        if standby and runtime not in (None, ""):
            try:
                runtime = int(runtime)
                if runtime > 0:
                    system["max_runtime_minutes"] = runtime
            except (TypeError, ValueError):
                pass

        systems.append(system)

    if not systems:
        raise ValueError("Apertus did not propose any valid systems.")

    ids = {s["id"] for s in systems}
    dependencies = []
    seen = set()

    for item in raw_dependencies[:40]:
        if not isinstance(item, dict):
            continue
        source = slugify(str(item.get("source", "")))
        target = slugify(str(item.get("target", "")))
        if source not in ids or target not in ids or source == target:
            continue
        if (source, target) in seen:
            continue
        seen.add((source, target))

        effect = item.get("failure_effect", "failed")
        if effect not in {"failed", "degraded"}:
            effect = "failed"

        try:
            delay = max(0, int(item.get("delay_minutes", 0)))
        except (TypeError, ValueError):
            delay = 0

        dep = {
            "source": source,
            "target": target,
            "type": str(item.get("type", "service")).strip()[:80] or "service",
            "failure_effect": effect,
            "delay_minutes": delay,
        }
        group = clean_requirement_group(item.get("requirement_group"))
        if group:
            dep["requirement_group"] = group
        dependencies.append(dep)

    draft = {
        "organization": {
            "id": slugify(organization_name) or f"organization-{uuid4().hex[:6]}",
            "name": organization_name,
            "type": organization_type or "organization",
            "demo": False,
        },
        "systems": systems,
        "dependencies": dependencies,
    }

    validation_error = validate_model(draft)
    if validation_error:
        raise ValueError(validation_error)
    return draft


def normalize_component_key(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


def extract_explicit_components_with_apertus(name, organization_type, description):
    """
    Pass 1: inventory extraction only.
    No dependencies are generated here.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "Extract the concrete operational components EXPLICITLY mentioned in the "
                "user's organisation description. A component may be a system, service, "
                "resource, supply, backup, record system, operational function, or infrastructure "
                "item. The organisation itself is a container and must NOT be included. "
                "Do not infer extra components. Do not omit a component because it sounds like "
                "a business function. Preserve the user's meaning while giving each component "
                "a concise name. Return JSON only: "
                "{\"components\":[{\"name\":\"...\",\"evidence\":\"short exact phrase from description\"}]}. "
                "Every returned component must have direct textual evidence."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({
                "organization_name": name,
                "organization_type": organization_type,
                "description": description,
            }, indent=2),
        },
    ]
    raw = call_apertus(messages, max_tokens=900)
    parsed = extract_json_object(aperture_message_text(raw))
    components = parsed.get("components", [])
    if not isinstance(components, list):
        raise ValueError("Apertus did not return a component inventory.")

    cleaned = []
    seen = set()
    org_key = normalize_component_key(name)
    description_lower = description.lower()

    for item in components:
        if not isinstance(item, dict):
            continue
        cname = str(item.get("name", "")).strip()
        evidence = str(item.get("evidence", "")).strip()
        if not cname or not evidence:
            continue

        # Evidence must actually occur in the supplied description.
        if evidence.lower() not in description_lower:
            continue

        key = normalize_component_key(cname)
        if not key or key == org_key or key in seen:
            continue
        seen.add(key)
        cleaned.append({
            "id": slugify(cname),
            "name": cname[:100],
            "evidence": evidence[:180],
        })

    if not cleaned:
        raise ValueError("No explicitly described components could be verified.")

    return cleaned


def build_model_from_locked_inventory(
    name, organization_type, description, inventory
):
    """
    Pass 2: Apertus may propose attributes/relationships, but it may only use
    the already verified component inventory.
    """
    locked = [
        {"id": item["id"], "name": item["name"], "evidence": item["evidence"]}
        for item in inventory
    ]

    messages = [
        {
            "role": "system",
            "content": (
                "Build a FRACTRA graph using EVERY component in locked_components exactly once. "
                "You MUST NOT add, remove, merge, rename, or replace components. "
                "The organisation itself is not a system. "
                "DEPENDENCY DIRECTION: provider -> consumer. A -> B means if A is unavailable, "
                "B is affected. If B depends on A, output A -> B. "
                "If loss of A lets B continue at reduced capability, failure_effect='degraded'. "
                "If a primary and backup both provide the same requirement to a consumer, "
                "create one edge from each provider to that consumer and assign the SAME "
                "requirement_group to both edges. Do not create primary -> backup merely because "
                "the backup replaces the primary. A backup may depend on a supply when explicitly stated. "
                "standby=true only when the description explicitly says backup/alternate/standby. "
                "max_runtime_minutes only when an exact runtime is explicitly stated. "
                "delay_minutes=0 unless an exact delay is explicitly stated. "
                "Criticality is a proposed 1-5 review value, not a factual claim. "
                "Return JSON only with systems and dependencies. "
                "Each system MUST use the supplied locked id and name. "
                "System keys: id,name,category,criticality,standby, optional max_runtime_minutes. "
                "Dependency keys: source,target,type,failure_effect,delay_minutes, optional requirement_group."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({
                "description": description,
                "locked_components": locked,
            }, indent=2),
        },
    ]

    raw = call_apertus(messages, max_tokens=1600)
    proposal = extract_json_object(aperture_message_text(raw))

    proposed_systems = proposal.get("systems", [])
    proposed_by_id = {
        str(item.get("id")): item
        for item in proposed_systems
        if isinstance(item, dict)
    }

    # FRACTRA reconstructs systems from the LOCKED inventory, so Apertus cannot
    # silently omit a component. Apertus supplies only reviewable attributes.
    systems = []
    for component in locked:
        item = proposed_by_id.get(component["id"], {})
        try:
            criticality = max(1, min(5, int(item.get("criticality", 3))))
        except (TypeError, ValueError):
            criticality = 3

        standby = bool(item.get("standby", False))
        system = {
            "id": component["id"],
            "name": component["name"],
            "category": str(item.get("category", "general")).strip()[:80] or "general",
            "criticality": criticality,
            "standby": standby,
            "source_evidence": component["evidence"],
        }

        runtime = item.get("max_runtime_minutes")
        if standby and runtime not in (None, ""):
            try:
                runtime = int(runtime)
                if runtime > 0:
                    system["max_runtime_minutes"] = runtime
            except (TypeError, ValueError):
                pass

        systems.append(system)

    allowed_ids = {item["id"] for item in locked}
    dependencies = []
    seen = set()

    for dep in proposal.get("dependencies", []):
        if not isinstance(dep, dict):
            continue
        source = str(dep.get("source", ""))
        target = str(dep.get("target", ""))
        if source not in allowed_ids or target not in allowed_ids or source == target:
            continue
        if (source, target) in seen:
            continue
        seen.add((source, target))

        effect = dep.get("failure_effect", "failed")
        if effect not in {"failed", "degraded"}:
            effect = "failed"

        try:
            delay = max(0, int(dep.get("delay_minutes", 0)))
        except (TypeError, ValueError):
            delay = 0

        clean_dep = {
            "source": source,
            "target": target,
            "type": str(dep.get("type", "service")).strip()[:80] or "service",
            "failure_effect": effect,
            "delay_minutes": delay,
        }
        group = clean_requirement_group(dep.get("requirement_group"))
        if group:
            clean_dep["requirement_group"] = group
        dependencies.append(clean_dep)

    draft = {
        "organization": {
            "id": slugify(name) or f"organization-{uuid4().hex[:6]}",
            "name": name,
            "type": organization_type or "organization",
            "demo": False,
        },
        "systems": systems,
        "dependencies": dependencies,
    }

    validation_error = validate_model(draft)
    if validation_error:
        raise ValueError(validation_error)

    return draft


@app.post("/api/apertus/propose-inventory")
def propose_inventory_with_apertus():
    """
    Stage 1: Apertus suggests candidate components only.
    The result is explicitly incomplete until a human locks the inventory.
    """
    if not PUBLICAI_API_KEY:
        return jsonify({"error": "Apertus is not configured on the server."}), 503

    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    organization_type = str(body.get("type", "organization")).strip() or "organization"
    description = str(body.get("description", "")).strip()

    if not name:
        return jsonify({"error": "Organization name is required."}), 400
    if len(description) < 20:
        return jsonify({"error": "Describe how the organization works in a little more detail."}), 400

    try:
        inventory = extract_explicit_components_with_apertus(
            name, organization_type, description
        )
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 502

    systems = []
    for component in inventory:
        systems.append({
            "id": component["id"],
            "name": component["name"],
            "category": "general",
            "criticality": 3,
            "standby": False,
            "source_evidence": component["evidence"],
        })

    return jsonify({
        "status": "inventory_review_required",
        "organization": {
            "name": name,
            "type": organization_type,
        },
        "systems": systems,
        "notice": (
            "Apertus suggested candidate components from your description. "
            "This is not a completeness claim. Add, rename or remove systems until "
            "the inventory matches the organisation, then lock it."
        ),
    })


@app.post("/api/apertus/propose-relationships")
def propose_relationships_with_apertus():
    """
    Stage 2: human-confirmed inventory is locked.
    Apertus may propose attributes/relationships but cannot change inventory.
    """
    if not PUBLICAI_API_KEY:
        return jsonify({"error": "Apertus is not configured on the server."}), 503

    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()
    organization_type = str(body.get("type", "organization")).strip() or "organization"
    description = str(body.get("description", "")).strip()
    locked_systems = body.get("systems", [])

    if not name or not isinstance(locked_systems, list) or len(locked_systems) < 2:
        return jsonify({"error": "At least two human-confirmed systems are required."}), 400

    # FRACTRA sanitizes and locks the exact human-confirmed inventory.
    cleaned = []
    seen = set()
    for raw in locked_systems[:30]:
        if not isinstance(raw, dict):
            continue
        sname = str(raw.get("name", "")).strip()
        if not sname:
            continue
        sid = slugify(str(raw.get("id") or sname))
        base = sid
        n = 2
        while sid in seen:
            sid = f"{base}-{n}"
            n += 1
        seen.add(sid)
        evidence = str(
            raw.get("evidence")
            or raw.get("source_evidence")
            or "Added by human reviewer"
        ).strip()[:180]

        cleaned.append({
            "id": sid,
            "name": sname[:100],
            "evidence": evidence,
            "source_evidence": evidence,
        })

    if len(cleaned) < 2:
        return jsonify({"error": "At least two valid systems are required."}), 400

    try:
        draft = build_model_from_locked_inventory(
            name, organization_type, description, cleaned
        )
    except (RuntimeError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 502

    # Hard invariant: every locked system must be present exactly once.
    locked_ids = {item["id"] for item in cleaned}
    draft_ids = {item["id"] for item in draft.get("systems", [])}
    if locked_ids != draft_ids:
        return jsonify({
            "error": "Locked inventory integrity check failed. No model was saved."
        }), 502

    return jsonify({
        "status": "relationship_review_required",
        "draft": draft,
        "locked_count": len(cleaned),
        "notice": (
            "The system inventory is human-confirmed and locked. Apertus proposed "
            "relationships using only those systems. Review every arrow before approval."
        ),
        "dependency_rule": (
            "SOURCE → TARGET means: if SOURCE is lost, TARGET is affected."
        ),
    })


@app.post("/api/models/approve-draft")
def approve_model_draft():
    """
    Persist only a complete human-reviewed draft supplied by the browser.
    Server-side validation is authoritative.
    """
    body = request.get_json(silent=True) or {}
    draft = body.get("draft")

    if not isinstance(draft, dict):
        return jsonify({"error": "A reviewed draft is required."}), 400

    validation_error = validate_model(draft)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    organization = draft.get("organization", {})
    name = str(organization.get("name", "")).strip()
    if not name:
        return jsonify({"error": "Organization name is required."}), 400

    base_id = slugify(name)
    if not base_id:
        return jsonify({"error": "Invalid organization name."}), 400

    model_id = base_id
    suffix = 2
    while get_model_path(model_id).exists():
        model_id = f"{base_id}-{suffix}"
        suffix += 1

    approved = json.loads(json.dumps(draft))
    approved["organization"]["id"] = model_id
    approved["organization"]["demo"] = False
    approved["organization"]["model_source"] = "human_reviewed_apertus_draft"
    approved["organization"]["clerk_org_id"] = current_org_id()
    approved["organization"]["created_at"] = utc_now_iso()

    save_model(approved)

    return jsonify({
        "status": "saved",
        "model": approved,
        "notice": (
            "Human-reviewed organization model saved. "
            "FRACTRA simulations will now treat this approved graph as the model."
        ),
    }), 201


@app.post("/api/apertus/analyse")
def analyse_with_apertus():
    """
    Re-run the deterministic simulation server-side and give its verified
    result to Apertus for explanation and mitigation hypotheses.
    """
    if not PUBLICAI_API_KEY:
        return jsonify({
            "error": "Apertus is not configured on the server."
        }), 503

    body = request.get_json(silent=True) or {}
    initial_failures = body.get("initial_failures", [])
    model_id = body.get("model_id")

    if not isinstance(initial_failures, list):
        return jsonify({
            "error": "Initial failures must be a list."
        }), 400

    if not initial_failures:
        return jsonify({
            "error": "At least one initial failure is required."
        }), 400

    if model_id:
        path = get_model_path(model_id)

        if not path.exists():
            return jsonify({
                "error": "Organization model not found."
            }), 404

        model = load_json(path)
    else:
        model = load_model()

    validation_error = validate_model(model)

    if validation_error:
        return jsonify({
            "error": "The organization model is invalid.",
            "details": validation_error,
        }), 400

    system_ids = {
        system["id"]
        for system in model["systems"]
    }

    unknown_failures = [
        system_id
        for system_id in initial_failures
        if system_id not in system_ids
    ]

    if unknown_failures:
        return jsonify({
            "error": "Unknown systems.",
            "systems": unknown_failures,
        }), 400

    # Critical trust boundary:
    # Never accept a browser-supplied cascade as authoritative.
    simulation = simulate_failure(
        model,
        initial_failures,
    )
    simulation["organization"] = model["organization"]

    messages = [
        {
            "role": "system",
            "content": (
                "You are FRACTRA's grounded resilience reasoning layer. "
                "The deterministic FRACTRA engine is the sole source of "
                "truth for simulation outcomes."
            ),
        },
        {
            "role": "user",
            "content": build_apertus_prompt(
                model,
                simulation,
            ),
        },
    ]

    try:
        payload = call_apertus(
            messages,
            max_tokens=700,
        )
        content = (
            payload["choices"][0]["message"]["content"]
        )

    except RuntimeError as error:
        return jsonify({
            "error": "Could not reach Apertus.",
            "details": str(error),
        }), 502

    except (KeyError, IndexError, TypeError) as error:
        return jsonify({
            "error": "Apertus returned an unexpected response.",
            "details": str(error),
        }), 502

    try:
        analysis = extract_apertus_json(content)

    except (json.JSONDecodeError, TypeError, ValueError):
        return jsonify({
            "error": (
                "Apertus did not return valid structured JSON."
            ),
            "raw_response": str(content)[:4000],
        }), 502

    required_keys = {
        "summary",
        "cascade_explanation",
        "hidden_vulnerabilities",
        "single_points_of_failure",
        "mitigations",
    }

    missing_keys = sorted(
        required_keys - set(analysis.keys())
    )

    if missing_keys:
        return jsonify({
            "error": (
                "Apertus analysis is missing required fields."
            ),
            "missing_fields": missing_keys,
            "raw_analysis": analysis,
        }), 502

    try:
        analysis = validate_apertus_analysis(
            analysis, model, simulation, initial_failures
        )
    except (TypeError, ValueError) as error:
        return jsonify({
            "error": "Apertus analysis failed FRACTRA validation.",
            "details": str(error),
        }), 502

    return jsonify({
        "provider": "Public AI",
        "model": APERTUS_MODEL,
        "initial_failures": initial_failures,
        "simulation": simulation,
        "analysis": analysis,
        "usage": payload.get("usage", {}),
    })


if __name__ == "__main__":
    app.run(
        debug=True,
        port=5000
    )