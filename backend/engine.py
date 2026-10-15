import heapq
from collections import defaultdict


STATUS_PRIORITY = {
    "stable": 0,
    "degraded": 1,
    "failed": 2,
}


def simulate_failure(model, initial_failures):
    systems = {
        system["id"]: {
            **system,
            "status": "stable",
            "active": not system.get("standby", False),
        }
        for system in model["systems"]
    }

    dependencies = model.get("dependencies", [])

    events = []
    queue = []
    event_number = 0

    requirement_groups = defaultdict(list)

    for dependency in dependencies:
        group = dependency.get("requirement_group")

        if group:
            requirement_groups[
                (dependency["target"], group)
            ].append(dependency)

    def push_event(
        time,
        system_id,
        event_type,
        status=None,
        caused_by=None,
        dependency_type=None,
        reason=None,
    ):
        nonlocal event_number

        heapq.heappush(
            queue,
            (
                time,
                event_number,
                {
                    "event_type": event_type,
                    "system_id": system_id,
                    "status": status,
                    "caused_by": caused_by,
                    "dependency_type": dependency_type,
                    "reason": reason,
                }
            )
        )

        event_number += 1

    # ------------------------------------------------
    # INITIAL DISRUPTIONS
    # ------------------------------------------------

    for system_id in initial_failures:
        if system_id not in systems:
            continue

        push_event(
            time=0,
            system_id=system_id,
            event_type="status_change",
            status="failed",
            reason="Initial disruption",
        )

    # ------------------------------------------------
    # BACKUP ACTIVATION
    # ------------------------------------------------

    def activate_standby_if_needed(
        target_id,
        group_name,
        failed_provider,
        current_time,
    ):
        group = requirement_groups.get(
            (target_id, group_name),
            []
        )

        available = []

        for dependency in group:
            provider_id = dependency["source"]
            provider = systems.get(provider_id)

            if (
                provider
                and provider["status"] != "failed"
            ):
                available.append(provider_id)

        if not available:
            return False

        # Prefer an already-active provider.
        active_available = [
            provider_id
            for provider_id in available
            if systems[provider_id].get(
                "active",
                True
            )
        ]

        if active_available:
            return True

        # No active provider remains.
        # Activate one standby provider.
        standby_id = available[0]
        standby = systems[standby_id]

        standby["active"] = True

        events.append({
            "time_minutes": current_time,
            "system": standby_id,
            "status": "activated",
            "caused_by": failed_provider,
            "dependency_type": "redundancy",
            "reason": (
                f"Activated as backup provider "
                f"for {target_id}"
            )
        })

        runtime = standby.get(
            "max_runtime_minutes"
        )

        if runtime is not None:
            try:
                runtime = int(runtime)
            except (TypeError, ValueError):
                runtime = None

        if runtime is not None and runtime > 0:
            push_event(
                time=current_time + runtime,
                system_id=standby_id,
                event_type="runtime_exhaustion",
                status="failed",
                caused_by=target_id,
                dependency_type="capacity",
                reason=(
                    "Maximum backup runtime "
                    "exhausted"
                ),
            )

        return True

    # ------------------------------------------------
    # EVENT LOOP
    # ------------------------------------------------

    while queue:
        time, _, queued_event = heapq.heappop(
            queue
        )

        system_id = queued_event["system_id"]

        if system_id not in systems:
            continue

        event_type = queued_event[
            "event_type"
        ]

        new_status = queued_event.get(
            "status"
        )

        caused_by = queued_event.get(
            "caused_by"
        )

        dependency_type = queued_event.get(
            "dependency_type"
        )

        reason = queued_event.get("reason")

        current_status = systems[
            system_id
        ]["status"]

        if event_type == "runtime_exhaustion":
            # Ignore stale exhaustion events if the
            # system has already failed.
            if current_status == "failed":
                continue

            new_status = "failed"

        if event_type == "status_change":
            if (
                STATUS_PRIORITY[new_status]
                <= STATUS_PRIORITY[current_status]
            ):
                continue

        systems[system_id]["status"] = (
            new_status
        )

        if new_status == "failed":
            systems[system_id]["active"] = False

        event = {
            "time_minutes": time,
            "system": system_id,
            "status": new_status,
            "caused_by": caused_by,
            "dependency_type":
                dependency_type,
        }

        if reason:
            event["reason"] = reason

        events.append(event)

        if new_status != "failed":
            continue

        # --------------------------------------------
        # PROPAGATE FAILURE
        # --------------------------------------------

        outgoing = [
            dependency
            for dependency in dependencies
            if dependency["source"]
            == system_id
        ]

        for dependency in outgoing:
            target_id = dependency["target"]

            if target_id not in systems:
                continue

            requirement_group = (
                dependency.get(
                    "requirement_group"
                )
            )

            if requirement_group:
                survived = (
                    activate_standby_if_needed(
                        target_id,
                        requirement_group,
                        system_id,
                        time,
                    )
                )

                if survived:
                    continue

            effect = dependency.get(
                "failure_effect",
                "failed"
            )

            delay = dependency.get(
                "delay_minutes",
                1
            )

            try:
                delay = int(delay)
            except (TypeError, ValueError):
                delay = 1

            delay = max(0, delay)

            push_event(
                time=time + delay,
                system_id=target_id,
                event_type="status_change",
                status=effect,
                caused_by=system_id,
                dependency_type=dependency.get(
                    "type",
                    "service"
                ),
                reason=(
                    f"Dependency on "
                    f"{system_id} was lost"
                ),
            )

    score = calculate_resilience(systems)

    metrics = calculate_metrics(
        systems,
        events
    )

    return {
        "systems": list(systems.values()),
        "events": sorted(
            events,
            key=lambda event:
                event["time_minutes"]
        ),
        "resilience_score": score,
        "metrics": metrics,
    }


def calculate_resilience(systems):
    status_factor = {
        "stable": 1.0,
        "degraded": 0.5,
        "failed": 0.0,
    }

    total_weight = 0
    surviving_weight = 0

    for system in systems.values():
        criticality = system.get(
            "criticality",
            1
        )

        try:
            criticality = int(criticality)
        except (TypeError, ValueError):
            criticality = 1

        criticality = max(
            1,
            min(5, criticality)
        )

        total_weight += criticality

        surviving_weight += (
            criticality
            * status_factor.get(
                system["status"],
                1
            )
        )

    if total_weight == 0:
        return 100

    return round(
        100
        * surviving_weight
        / total_weight
    )


def calculate_metrics(systems, events):
    failed = sum(
        system["status"] == "failed"
        for system in systems.values()
    )

    degraded = sum(
        system["status"] == "degraded"
        for system in systems.values()
    )

    stable = sum(
        system["status"] == "stable"
        for system in systems.values()
    )

    duration = max(
        (
            event["time_minutes"]
            for event in events
        ),
        default=0
    )

    return {
        "failed_systems": failed,
        "degraded_systems": degraded,
        "stable_systems": stable,
        "cascade_events": max(
            0,
            len(events) - 1
        ),
        "cascade_duration_minutes":
            duration,
    }