import { useEffect, useMemo, useState } from "react";



import {

  Activity,

  ArrowRight,

  ChevronUp,

  Link2,

  Pencil,

  Plus,

  RotateCcw,

  X,

  Zap,

} from "lucide-react";



import {

  Background,

  Controls,

  Handle,

  MarkerType,

  Position,

  ReactFlow,

} from "@xyflow/react";



import { SignIn, SignUp, UserButton, OrganizationSwitcher, CreateOrganization, useAuth, useOrganization } from "@clerk/react";

import "@xyflow/react/dist/style.css";

import "./App.css";



const API = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:5000"}/api`;





function SystemNode({ data }) {

  const displayStatus =
    data.status === "activated"
      ? "ACTIVE BACKUP"
      : data.status === "confirmed-failed"
      ? "CONFIRMED FAILED"
      : data.status === "confirmed-degraded"
      ? "CONFIRMED DEGRADED"
      : data.status === "confirmed-contained"
      ? "CONTAINED"
      : data.status === "confirmed-temporary_service"
      ? "TEMPORARY SERVICE"
      : data.status === "confirmed-restored"
      ? "RESTORED"
      : data.status === "confirmed-verified"
      ? "VERIFIED"
      : data.status === "conditional-risk"
      ? "CONDITIONAL RISK"
      : data.status === "model-risk"
      ? "MODEL RISK"
      : (data.status || "stable").toUpperCase();



  return (

    <div
      role={data.liveClickable ? "button" : undefined}
      tabIndex={data.liveClickable ? 0 : undefined}
      onClick={() => data.liveClickable && data.onLiveSelect?.(data.systemId)}
      onKeyDown={(event) => {
        if (data.liveClickable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          data.onLiveSelect?.(data.systemId);
        }
      }}

      className={`flow-system ${

        data.status === "activated"

          ? "active-backup"

          : data.status || "stable"

      }`}

    >

      <Handle

        type="target"

        position={Position.Top}

        className="flow-handle"

      />



      <span>{displayStatus}</span>



      <strong>{data.name}</strong>



      <small>

        {data.category}

        {data.standby ? " · STANDBY" : ""}

      </small>



      <Handle

        type="source"

        position={Position.Bottom}

        className="flow-handle"

      />

    </div>

  );

}





const nodeTypes = {

  system: SystemNode,

};





function App() {

  const { isLoaded: clerkLoaded, isSignedIn, getToken } = useAuth();
  const { organization } = useOrganization();
  const [authView, setAuthView] = useState("signin");

  async function clerkFetch(url, options = {}) {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return window.fetch(url, { ...options, headers });
  }

  const [models, setModels] = useState([]);

  const [model, setModel] = useState(null);

  const [simulation, setSimulation] = useState(null);



  const [loading, setLoading] = useState(true);

  const [simulating, setSimulating] = useState(false);

  const [error, setError] = useState("");
  const [apertusAnalysis, setApertusAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [apertusError, setApertusError] = useState("");
  const [selectedMitigation, setSelectedMitigation] = useState(null);

  // Real incident state stays separate from simulated state.
  const [liveIncident, setLiveIncident] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveForm, setLiveForm] = useState({
    name: "",
    type: "power-outage",
    note: "",
  });
  const [liveSelectedSystem, setLiveSelectedSystem] = useState("");
  const [liveNote, setLiveNote] = useState("");
  const [liveAction, setLiveAction] = useState("");
  const [activePhase, setActivePhase] = useState("before");
  const [liveNow, setLiveNow] = useState(Date.now());
  const [confirmEndIncident, setConfirmEndIncident] = useState(false);
  const [gapLoading, setGapLoading] = useState("");
  const [gapDrafts, setGapDrafts] = useState({});
  const [branchLoading, setBranchLoading] = useState(false);
  const [counterfactual, setCounterfactual] = useState(null);
  const [counterfactualLoading, setCounterfactualLoading] = useState(false);
  const [calibrationTests, setCalibrationTests] = useState([]);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [calibrationHistory, setCalibrationHistory] = useState([]);
  const [mitigationTests, setMitigationTests] = useState([]);
  const [mitigationResult, setMitigationResult] = useState(null);
  const [mitigationLoading, setMitigationLoading] = useState(false);
  const [breakMeChallenge, setBreakMeChallenge] = useState(null);
  const [breakMeLoading, setBreakMeLoading] = useState(false);
  const [createOwnOpen, setCreateOwnOpen] = useState(false);
  const [createOwnLoading, setCreateOwnLoading] = useState(false);
  const [createOwnDraft, setCreateOwnDraft] = useState(null);
  const [createOwnNotice, setCreateOwnNotice] = useState("");
  const [createOwnCoverage, setCreateOwnCoverage] = useState(null);
  const [createOwnStage, setCreateOwnStage] = useState("describe");
  const [createOwnInventory, setCreateOwnInventory] = useState([]);
  const [createOwnForm, setCreateOwnForm] = useState({
    name: "",
    type: "",
    description: "",
  });








  const [panel, setPanel] = useState(null);

  const [timelineOpen, setTimelineOpen] = useState(true);

  const [baselineSimulation, setBaselineSimulation] =
    useState(null);
  const [baselineFailure, setBaselineFailure] =
    useState("");
  const [replaySimulation, setReplaySimulation] =
    useState(null);
  const [editingSystemId, setEditingSystemId] =
    useState("");
  const [editSystemForm, setEditSystemForm] = useState({
    name: "",
    category: "",
    criticality: 3,
    standby: false,
    max_runtime_minutes: "",
  });


  const [selectedSystem, setSelectedSystem] =

    useState("");



  const [organizationForm, setOrganizationForm] =

    useState({

      name: "",

      type: "",

    });



  const [systemForm, setSystemForm] = useState({

    name: "",

    category: "",

    criticality: 3,

    standby: false,

    max_runtime_minutes: "",

  });



  const [dependencyForm, setDependencyForm] =

    useState({

      source: "",

      target: "",

      type: "service",

      failure_effect: "failed",

      delay_minutes: 1,

      requirement_group: "",

    });





  useEffect(() => {
    if (clerkLoaded && isSignedIn && organization) {
      initialize();
    } else if (clerkLoaded) {
      setLoading(false);
    }
  }, [clerkLoaded, isSignedIn, organization?.id]);





  async function initialize() {

    try {

      setLoading(true);

      setError("");



      const response = await clerkFetch(

        `${API}/models`

      );



      if (!response.ok) {

        throw new Error(

          "Could not load organization models."

        );

      }



      const availableModels =

        await response.json();



      setModels(availableModels);



      if (availableModels.length > 0) {

        const demo =

          availableModels.find(

            (item) => item.demo

          ) || availableModels[0];



        await loadModel(demo.id);

      }

    } catch (err) {

      setError(err.message);

    } finally {

      setLoading(false);

    }

  }





  useEffect(() => {
    if (liveIncident?.status !== "active") return undefined;
    setLiveNow(Date.now());
    const timer = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [liveIncident?.id, liveIncident?.status]);


  async function loadModels() {

    const response = await clerkFetch(

      `${API}/models`

    );



    if (!response.ok) {

      throw new Error(

        "Could not refresh organization models."

      );

    }



    const data = await response.json();



    setModels(data);



    return data;

  }





  async function loadModel(modelId) {

    try {

      setError("");



      const response = await clerkFetch(

        `${API}/models/${modelId}`

      );



      if (!response.ok) {

        throw new Error(

          "Could not load this organization."

        );

      }



      const data = await response.json();



      setModel(data);

      setSimulation(null);

      setSelectedSystem("");

      setTimelineOpen(false);
      setApertusAnalysis(null);
      setApertusError("");
      setSelectedMitigation(null);
      setBreakMeChallenge(null);

      setLiveSelectedSystem("");
      setLiveNote("");
      setLiveAction("");

      // Reopen the latest active incident after refresh/model reload.
      try {
        const incidentResponse = await clerkFetch(
          `${API}/incidents?model_id=${encodeURIComponent(data.organization.id)}`
        );
        const incidents = await incidentResponse.json();
        const activeIncident = Array.isArray(incidents)
          ? incidents.find((incident) => incident.status === "active")
          : null;

        if (activeIncident) {
          const fullIncidentResponse = await clerkFetch(
            `${API}/incidents/${activeIncident.id}`
          );
          const fullIncident = await fullIncidentResponse.json();

          if (fullIncidentResponse.ok) {
            setLiveIncident(fullIncident);
            setActivePhase("during");
          } else {
            setLiveIncident(null);
          }
        } else {
          setLiveIncident(null);
        }
      } catch {
        setLiveIncident(null);
      }

    } catch (err) {

      setError(err.message);

    }

  }





  async function refreshCurrentModel() {
    if (!model) return null;

    const response = await clerkFetch(
      `${API}/models/${model.organization.id}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not refresh this organization."
      );
    }

    setModel(data);
    return data;
  }


  function openSystemEditor(system) {
    setEditingSystemId(system.id);
    setEditSystemForm({
      name: system.name || "",
      category: system.category || "",
      criticality: Number(system.criticality || 3),
      standby: Boolean(system.standby),
      max_runtime_minutes:
        system.max_runtime_minutes ?? "",
    });
    setPanel("edit-system");
  }


  function openApertusMitigation(item) {
    if (!model || !item) return;

    const targetId = item.target_system_id;
    const system = model.systems.find(
      (candidate) => candidate.id === targetId
    );

    if (!system) {
      setError(
        "This Apertus mitigation does not target an editable system."
      );
      return;
    }

    const test = String(item.test || "");
    const lowerTest = test.toLowerCase();

    // FRACTRA, not Apertus, creates the concrete editable proposal.
    // For runtime mitigations, use an explicit proposed value when the
    // structured test contains one; otherwise use a transparent 2x test.
    let proposedRuntime = system.max_runtime_minutes ?? "";

    if (lowerTest.includes("max_runtime_minutes")) {
      const numericValues = [
        ...test.matchAll(/\b(\d+(?:\.\d+)?)\b/g),
      ].map((match) => Number(match[1]));

      const currentRuntime = Number(system.max_runtime_minutes);
      const differentValue = numericValues.find(
        (value) =>
          Number.isFinite(value) &&
          value > 0 &&
          value !== currentRuntime
      );

      proposedRuntime =
        differentValue ??
        (Number.isFinite(currentRuntime) && currentRuntime > 0
          ? currentRuntime * 2
          : "");
    }

    setSelectedMitigation({
      title: item.title || "Apertus mitigation",
      reason: item.reason || "",
      test: item.test || "",
      target_system_id: targetId,
      original_runtime: system.max_runtime_minutes ?? null,
      proposed_runtime: proposedRuntime,
    });

    setEditingSystemId(system.id);
    setEditSystemForm({
      name: system.name || "",
      category: system.category || "",
      criticality: Number(system.criticality || 3),
      standby: Boolean(system.standby),
      max_runtime_minutes: proposedRuntime,
    });
    setPanel("edit-system");
  }


  async function updateSystem(event) {
    event.preventDefault();

    if (!model || !editingSystemId) return;

    try {
      setError("");

      const payload = {
        name: editSystemForm.name,
        category: editSystemForm.category,
        criticality: Number(editSystemForm.criticality),
        standby: Boolean(editSystemForm.standby),
        max_runtime_minutes:
          editSystemForm.standby &&
          editSystemForm.max_runtime_minutes !== ""
            ? Number(editSystemForm.max_runtime_minutes)
            : "",
      };

      const response = await clerkFetch(
        `${API}/models/${model.organization.id}/systems/${editingSystemId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not save this mitigation."
        );
      }

      await refreshCurrentModel();
      setReplaySimulation(null);
      setSelectedMitigation(null);
      setPanel(null);
    } catch (err) {
      setError(err.message);
    }
  }


  async function replaySameFailure() {
    if (!model || !baselineFailure || !baselineSimulation) {
      setError(
        "Run an original stress test before replaying a mitigation."
      );
      return;
    }

    try {
      setSimulating(true);
      setError("");

      const response = await clerkFetch(`${API}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: model.organization.id,
          initial_failures: [baselineFailure],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Replay failed.");
      }

      setReplaySimulation(data);
      setSimulation(data);
      setSelectedSystem(baselineFailure);
      setApertusAnalysis(null);
      setApertusError("");
      setTimelineOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  }


  async function startLiveIncident(event) {
    event.preventDefault();
    if (!model) return;
    try {
      setLiveLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: model.organization.id,
          name: liveForm.name,
          type: liveForm.type,
          note: liveForm.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start live incident.");
      setLiveIncident(data);
      setActivePhase("during");
      setSimulation(null);
      setTimelineOpen(false);
      setLiveSelectedSystem("");
      setLiveNote("");
      setLiveAction("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  async function refreshLiveIncident(incidentId = liveIncident?.id) {
    if (!incidentId) return null;
    const response = await clerkFetch(`${API}/incidents/${incidentId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not refresh live incident.");
    setLiveIncident(data);
    return data;
  }

  async function recordLiveObservation(state) {
    if (!liveIncident || !liveSelectedSystem) {
      setError("Select a system before recording a confirmed observation.");
      return;
    }
    try {
      setLiveLoading(true);
      setError("");
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_id: liveSelectedSystem,
            state,
            note: liveNote,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record observation.");
      await refreshLiveIncident();
      setLiveNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  async function recordLiveAction(event) {
    event.preventDefault();
    if (!liveIncident || !liveAction.trim()) return;
    try {
      setLiveLoading(true);
      setError("");
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: liveAction }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record response action.");
      await refreshLiveIncident();
      setLiveAction("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  async function endLiveIncident() {
    if (!liveIncident) return;
    try {
      setLiveLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not end incident.");
      setLiveIncident(data);
      setConfirmEndIncident(false);
      setActivePhase("after");

      // Move the viewport with the lifecycle change so AFTER visibly opens.
      window.requestAnimationFrame(() => {
        const lifecycle = document.querySelector(".lifecycle-nav");
        if (lifecycle) {
          lifecycle.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLiveLoading(false);
    }
  }

  function latestLiveState(systemId) {
    if (!liveIncident) return null;
    const observations = liveIncident.observations || [];
    for (let i = observations.length - 1; i >= 0; i -= 1) {
      if (observations[i].system_id === systemId) return observations[i].state;
    }
    return null;
  }

  function liveRiskAssessment() {
    const risk = new Set();
    const conditional = new Set();

    if (!liveIncident || !model) return { risk, conditional };

    const affected = new Set(
      model.systems
        .filter((system) =>
          ["failed", "degraded"].includes(latestLiveState(system.id))
        )
        .map((system) => system.id)
    );

    const visited = new Set(affected);
    const queue = [...affected];

    while (queue.length) {
      const source = queue.shift();

      model.dependencies
        .filter((dependency) => dependency.source === source)
        .forEach((dependency) => {
          const target = dependency.target;
          const targetConfirmed = latestLiveState(target);

          if (targetConfirmed) return;

          const group = dependency.requirement_group;

          if (group) {
            const providers = model.dependencies.filter(
              (candidate) =>
                candidate.target === target &&
                candidate.requirement_group === group
            );

            const alternateAvailable = providers.some((provider) => {
              if (provider.source === source) return false;
              const state = latestLiveState(provider.source);
              return state !== "failed" && state !== "degraded";
            });

            if (alternateAvailable) {
              // Another modeled provider exists. We do not claim it activated;
              // we only lower this to conditional risk until reality confirms more.
              conditional.add(target);
              return;
            }
          }

          risk.add(target);

          if (!visited.has(target)) {
            visited.add(target);
            queue.push(target);
          }
        });
    }

    return { risk, conditional };
  }

  function liveRiskSystems() {
    return liveRiskAssessment().risk;
  }

  function liveConditionalSystems() {
    return liveRiskAssessment().conditional;
  }

  function formatElapsed(timestamp) {
    if (!liveIncident?.started_at || !timestamp) return "T+00:00";
    const start = new Date(liveIncident.started_at).getTime();
    const point =
      typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime();
    const total = Math.max(0, Math.floor((point - start) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
      ? `T+${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `T+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function liveOverview() {
    if (!model || !liveIncident) {
      return { failed: 0, degraded: 0, recovering: 0, restored: 0, risk: 0, conditional: 0 };
    }

    const states = model.systems.map((system) => latestLiveState(system.id));
    const assessment = liveRiskAssessment();

    return {
      failed: states.filter((state) => state === "failed").length,
      degraded: states.filter((state) => state === "degraded").length,
      recovering: states.filter((state) =>
        ["contained", "temporary_service"].includes(state)
      ).length,
      restored: states.filter((state) =>
        ["restored", "verified"].includes(state)
      ).length,
      risk: assessment.risk.size,
      conditional: assessment.conditional.size,
    };
  }

  function livePriorities() {
    if (!model || !liveIncident) return [];

    const assessment = liveRiskAssessment();
    const items = [];

    model.systems.forEach((system) => {
      const state = latestLiveState(system.id);

      if (state === "failed" || state === "degraded") {
        items.push({
          system,
          level: state === "failed" ? 0 : 1,
          text: `${system.name} is confirmed ${state}.`,
        });
      } else if (assessment.risk.has(system.id)) {
        items.push({
          system,
          level: 2,
          text: `${system.name} is exposed by the dependency model.`,
        });
      } else if (assessment.conditional.has(system.id)) {
        items.push({
          system,
          level: 3,
          text: `${system.name} has modeled alternate provision; verify it is actually available.`,
        });
      }
    });

    return items
      .sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return (b.system.criticality || 0) - (a.system.criticality || 0);
      })
      .slice(0, 5);
  }


  async function refreshIncident() {
    if (!liveIncident?.id) return null;
    const response = await clerkFetch(`${API}/incidents/${liveIncident.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not refresh incident.");
    setLiveIncident(data);
    return data;
  }

  async function analyseGap(index) {
    if (!liveIncident) return;
    try {
      setGapLoading(`analyse-${index}`);
      setError("");
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/gaps/${index}/analyse`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not analyse model gap.");
      await refreshIncident();
    } catch (err) {
      setError(err.message);
    } finally {
      setGapLoading("");
    }
  }

  function proposalKey(index, proposalId) {
    return `${index}:${proposalId}`;
  }

  function proposalDraft(index, proposal) {
    const key = proposalKey(index, proposal.id);
    return gapDrafts[key] || JSON.stringify(proposal.change, null, 2);
  }

  function updateProposalDraft(index, proposal, value) {
    const key = proposalKey(index, proposal.id);
    setGapDrafts((current) => ({ ...current, [key]: value }));
  }

  async function decideGap(index, proposal, decision) {
    try {
      setGapLoading(`${decision}-${proposal.id}`);
      setError("");
      let change = proposal.change;
      if (decision === "accepted") {
        try {
          change = JSON.parse(proposalDraft(index, proposal));
        } catch {
          throw new Error("The edited model change must be valid JSON.");
        }
      }
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/gaps/${index}/decide`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal_id: proposal.id,
            decision,
            change,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save review decision.");
      await refreshIncident();
    } catch (err) {
      setError(err.message);
    } finally {
      setGapLoading("");
    }
  }

  async function loadMitigationTests() {
    if (!liveIncident?.id) return;
    try {
      setMitigationLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/mitigation/tests`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare mitigation tests.");
      setMitigationTests(
        (data.tests || []).filter(
          (test) =>
            test.source === "fractra_grounded_mitigation" &&
            test.title !== "Test an alternate provider path"
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setMitigationLoading(false);
    }
  }

  async function testMitigation(test) {
    try {
      setMitigationLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/mitigation/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test.changes ? { changes: test.changes } : { change: test.change }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not test mitigation.");
      setMitigationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setMitigationLoading(false);
    }
  }

  async function promoteMitigation() {
    if (!mitigationResult?.id) return;
    try {
      setMitigationLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/mitigation/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: mitigationResult.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create resilience branch.");
      await refreshIncident();
    } catch (err) {
      setError(err.message);
    } finally {
      setMitigationLoading(false);
    }
  }

  async function loadNextCalibrationTests() {
    if (!liveIncident?.id) return;
    try {
      setCalibrationLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/calibration/next`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare another calibration.");
      setCalibrationTests(data.tests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCalibrationLoading(false);
    }
  }

  async function applyCalibrationTest(test) {
    if (!liveIncident?.id) return;
    try {
      setCalibrationLoading(true);
      setError("");
      const response = await clerkFetch(`${API}/incidents/${liveIncident.id}/calibration/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change: test.change }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create the next calibration branch.");
      setCalibrationTests([]);
      setCounterfactual(null);
      setCalibrationHistory(data.history || []);
      await refreshIncident();
    } catch (err) {
      setError(err.message);
    } finally {
      setCalibrationLoading(false);
    }
  }

  async function runCounterfactualReplay() {
    if (!liveIncident?.id) return;
    try {
      setCounterfactualLoading(true);
      setError("");
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/counterfactual-replay`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not run counterfactual replay.");
      setCounterfactual(data);
      await refreshIncident();
    } catch (err) {
      setError(err.message);
    } finally {
      setCounterfactualLoading(false);
    }
  }



  async function createRealityBranch() {
    try {
      setBranchLoading(true);
      setError("");
      const response = await clerkFetch(
        `${API}/incidents/${liveIncident.id}/model-branch`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create model branch.");
      await refreshIncident();
      await loadModels();
    } catch (err) {
      setError(err.message);
    } finally {
      setBranchLoading(false);
    }
  }


  async function createOrganization(event) {

    event.preventDefault();



    try {

      setError("");



      const response = await clerkFetch(

        `${API}/models`,

        {

          method: "POST",



          headers: {

            "Content-Type":

              "application/json",

          },



          body: JSON.stringify(

            organizationForm

          ),

        }

      );



      const data = await response.json();



      if (!response.ok) {

        throw new Error(

          data.error ||

            "Could not create organization."

        );

      }



      await loadModels();



      setModel(data);

      setSimulation(null);

      setSelectedSystem("");



      setOrganizationForm({

        name: "",

        type: "",

      });



      setPanel(null);

    } catch (err) {

      setError(err.message);

    }

  }





  async function addSystem(event) {

    event.preventDefault();



    if (!model) return;



    try {

      setError("");



      const payload = {

        name: systemForm.name,

        category: systemForm.category,

        criticality:

          Number(systemForm.criticality),

        standby: Boolean(

          systemForm.standby

        ),

      };



      if (

        systemForm.standby &&

        systemForm.max_runtime_minutes !== ""

      ) {

        payload.max_runtime_minutes =

          Number(

            systemForm.max_runtime_minutes

          );

      }



      const response = await clerkFetch(

        `${API}/models/${model.organization.id}/systems`,

        {

          method: "POST",



          headers: {

            "Content-Type":

              "application/json",

          },



          body: JSON.stringify(payload),

        }

      );



      const data = await response.json();



      if (!response.ok) {

        throw new Error(

          data.error ||

            "Could not add system."

        );

      }



      await loadModel(

        model.organization.id

      );



      setSystemForm({

        name: "",

        category: "",

        criticality: 3,

        standby: false,

        max_runtime_minutes: "",

      });



      setPanel(null);

    } catch (err) {

      setError(err.message);

    }

  }





  async function addDependency(event) {
    event.preventDefault();

    if (!model) return;

    if (dependencyForm.source === dependencyForm.target) {
      setError("A system cannot depend on itself.");
      return;
    }

    try {
      setError("");

      const payload = {
        source: dependencyForm.source,
        target: dependencyForm.target,
        type: dependencyForm.type,
        failure_effect: dependencyForm.failure_effect,
        delay_minutes: Math.max(
          0,
          Number(dependencyForm.delay_minutes) || 0
        ),
      };

      if (dependencyForm.requirement_group.trim()) {
        payload.requirement_group =
          dependencyForm.requirement_group
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-");
      }

      const existingIndex = model.dependencies.findIndex(
        (dependency) =>
          dependency.source === dependencyForm.source &&
          dependency.target === dependencyForm.target
      );

      const isUpdating = existingIndex !== -1;
      const endpoint = isUpdating
        ? `${API}/models/${model.organization.id}/dependencies/${existingIndex}`
        : `${API}/models/${model.organization.id}/dependencies`;

      const response = await clerkFetch(endpoint, {
        method: isUpdating ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isUpdating
              ? "Could not update dependency."
              : "Could not create dependency.")
        );
      }

      await loadModel(model.organization.id);

      setDependencyForm({
        source: "",
        target: "",
        type: "service",
        failure_effect: "failed",
        delay_minutes: 1,
        requirement_group: "",
      });

      setPanel(null);
    } catch (err) {
      setError(err.message);
    }
  }





  async function proposeOwnInventory(event) {
    event.preventDefault();
    try {
      setCreateOwnLoading(true);
      setError("");
      setCreateOwnInventory([]);
      setCreateOwnDraft(null);
      setCreateOwnNotice("");

      const response = await clerkFetch(`${API}/apertus/propose-inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createOwnForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not draft component inventory.");

      setCreateOwnInventory(data.systems || []);
      setCreateOwnNotice(data.notice || "");
      setCreateOwnStage("inventory");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateOwnLoading(false);
    }
  }

  function updateInventorySystem(index, field, value) {
    setCreateOwnInventory((current) => {
      const next = JSON.parse(JSON.stringify(current));
      next[index][field] = value;
      return next;
    });
  }

  function removeInventorySystem(index) {
    setCreateOwnInventory((current) => current.filter((_, i) => i !== index));
  }

  function addInventorySystem() {
    setCreateOwnInventory((current) => [
      ...current,
      {
        id: `human-system-${Date.now()}`,
        name: "New System",
        category: "general",
        criticality: 3,
        standby: false,
        source_evidence: "Added by human reviewer",
      },
    ]);
  }

  async function lockInventoryAndBuildRelationships() {
    try {
      setCreateOwnLoading(true);
      setError("");

      const response = await clerkFetch(`${API}/apertus/propose-relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createOwnForm,
          systems: createOwnInventory,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build relationships.");

      setCreateOwnDraft(data.draft);
      setCreateOwnNotice(data.notice || "");
      setCreateOwnStage("relationships");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateOwnLoading(false);
    }
  }

  function updateDraftSystem(index, field, value) {
    setCreateOwnDraft((current) => {
      if (!current) return current;
      const next = JSON.parse(JSON.stringify(current));
      const system = next.systems[index];
      if (field === "criticality") {
        system[field] = Math.max(1, Math.min(5, Number(value) || 1));
      } else if (field === "standby") {
        system[field] = Boolean(value);
        if (!value) delete system.max_runtime_minutes;
      } else if (field === "max_runtime_minutes") {
        if (value === "") delete system.max_runtime_minutes;
        else system.max_runtime_minutes = Number(value);
      } else {
        system[field] = value;
      }
      return next;
    });
  }

  function removeDraftSystem(index) {
    setCreateOwnDraft((current) => {
      if (!current) return current;
      const next = JSON.parse(JSON.stringify(current));
      const removedId = next.systems[index].id;
      next.systems.splice(index, 1);
      next.dependencies = next.dependencies.filter(
        (dep) => dep.source !== removedId && dep.target !== removedId
      );
      return next;
    });
  }

  function updateDraftDependency(index, field, value) {
    setCreateOwnDraft((current) => {
      if (!current) return current;
      const next = JSON.parse(JSON.stringify(current));
      next.dependencies[index][field] =
        field === "delay_minutes" ? Math.max(0, Number(value) || 0) : value;
      return next;
    });
  }

  function removeDraftDependency(index) {
    setCreateOwnDraft((current) => {
      if (!current) return current;
      const next = JSON.parse(JSON.stringify(current));
      next.dependencies.splice(index, 1);
      return next;
    });
  }

  function uniqueDraftSystemId(baseName = "new-system") {
    const base = String(baseName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "new-system";
    const used = new Set((createOwnDraft?.systems || []).map((s) => s.id));
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }

  function addDraftSystem() {
    setCreateOwnDraft((current) => {
      if (!current) return current;
      const next = JSON.parse(JSON.stringify(current));
      const id = uniqueDraftSystemId("new-system");
      next.systems.push({
        id,
        name: "New System",
        category: "general",
        criticality: 3,
        standby: false,
      });
      return next;
    });
  }

  function addDraftDependency() {
    setCreateOwnDraft((current) => {
      if (!current || current.systems.length < 2) return current;
      const next = JSON.parse(JSON.stringify(current));
      next.dependencies.push({
        source: next.systems[0].id,
        target: next.systems[1].id,
        type: "service",
        failure_effect: "failed",
        delay_minutes: 0,
      });
      return next;
    });
  }

  async function approveOwnModel() {
    if (!createOwnDraft) return;
    try {
      setCreateOwnLoading(true);
      setError("");

      const response = await clerkFetch(`${API}/models/approve-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: createOwnDraft }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save the reviewed model.");
      }

      await loadModels();
      await loadModel(data.model.organization.id);
      setCreateOwnOpen(false);
      setCreateOwnDraft(null);
      setCreateOwnNotice("");
      setCreateOwnCoverage(null);
      setCreateOwnStage("describe");
      setCreateOwnInventory([]);
      setCreateOwnForm({ name: "", type: "", description: "" });
      setActivePhase("before");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreateOwnLoading(false);
    }
  }


  async function generateBreakMeChallenge() {
    if (!model) return;
    try {
      setBreakMeLoading(true);
      setError("");
      setBreakMeChallenge(null);

      const response = await clerkFetch(`${API}/apertus/break-me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: model.organization.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Apertus could not create a grounded challenge.");
      }
      setBreakMeChallenge(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBreakMeLoading(false);
    }
  }

  async function runBreakMeChallenge() {
    if (!breakMeChallenge?.system_id) return;
    setSelectedSystem(breakMeChallenge.system_id);
    await runStressTest(breakMeChallenge.system_id);
  }


  async function runStressTest(

    systemId = selectedSystem

  ) {

    if (!model || !systemId) {

      setError(

        "Choose a system to break first."

      );

      return;

    }



    try {

      setSimulating(true);

      setError("");



      const response = await clerkFetch(

        `${API}/simulate`,

        {

          method: "POST",



          headers: {

            "Content-Type":

              "application/json",

          },



          body: JSON.stringify({

            model_id:

              model.organization.id,



            initial_failures: [

              systemId,

            ],

          }),

        }

      );



      const data = await response.json();



      if (!response.ok) {

        throw new Error(

          data.error ||

            "Stress test failed."

        );

      }



      setSimulation(data);
      setBaselineSimulation(data);
      setBaselineFailure(systemId);
      setReplaySimulation(null);
      setApertusAnalysis(null);
      setApertusError("");
      setTimelineOpen(true);

    } catch (err) {

      setError(err.message);

    } finally {

      setSimulating(false);

    }

  }





  async function analyseWithApertus() {
    if (!model || !simulation || !selectedSystem) {
      setApertusError("Run a stress test before asking Apertus to analyse it.");
      return;
    }

    try {
      setAnalysing(true);
      setApertusError("");

      const response = await clerkFetch(`${API}/apertus/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: model.organization.id,
          initial_failures: [selectedSystem],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data.details
          ? `${data.error || "Apertus analysis failed."} ${data.details}`
          : data.error || "Apertus analysis failed.";
        throw new Error(message);
      }
      setApertusAnalysis(data);
    } catch (err) {
      setApertusError(err.message);
    } finally {
      setAnalysing(false);
    }
  }


  function resetSimulation(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    setSimulation(null);
    setBaselineSimulation(null);
    setBaselineFailure("");
    setReplaySimulation(null);
    setApertusAnalysis(null);
    setApertusError("");
    setSelectedMitigation(null);
    setTimelineOpen(false);
    setSelectedSystem("");
    setError("");
  }





  function statusFor(systemId) {
    if (liveIncident) {
      const confirmed = latestLiveState(systemId);
      if (confirmed) return `confirmed-${confirmed}`;
      if (liveConditionalSystems().has(systemId)) return "conditional-risk";
      if (liveRiskSystems().has(systemId)) return "model-risk";
      return "stable";
    }

    if (!simulation) {
      return "stable";
    }



    return (

      simulation.systems.find(

        (system) =>

          system.id === systemId

      )?.status || "stable"

    );

  }





  function wasActivated(systemId) {

    if (!simulation) {

      return false;

    }



    return simulation.events.some(

      (event) =>

        event.system === systemId &&

        event.status === "activated"

    );

  }





  const nodes = useMemo(() => {

    if (!model) return [];



    const columns = Math.max(

      1,

      Math.ceil(

        Math.sqrt(

          model.systems.length

        )

      )

    );



    return model.systems.map(

      (system, index) => {

        const column =

          index % columns;



        const row = Math.floor(

          index / columns

        );



        let nodeStatus =

          statusFor(system.id);



        if (

          nodeStatus === "stable" &&

          wasActivated(system.id)

        ) {

          nodeStatus =

            "activated";

        }



        return {

          id: system.id,



          type: "system",



          position: {

            x:

              90 +

              column * 245,



            y:

              80 +

              row * 175,

          },



          data: {

            systemId: system.id,
            liveClickable: activePhase === "during" && liveIncident?.status === "active",
            onLiveSelect: (systemId) => {
              setLiveSelectedSystem(systemId);
              setActivePhase("during");
            },
            name: system.name,

            category:

              system.category,

            status: nodeStatus,

            standby: Boolean(

              system.standby

            ),

          },

        };

      }

    );

  }, [model, simulation, liveIncident, activePhase]);





  const edges = useMemo(() => {

    if (!model) return [];



    return model.dependencies.map(

      (dependency, index) => {

        const affected =

          statusFor(

            dependency.source

          ) !== "stable" ||

          statusFor(

            dependency.target

          ) !== "stable" ||

          wasActivated(

            dependency.source

          );



        const labelParts = [

          dependency.type,

        ];



        if (

          dependency.delay_minutes !==

          undefined

        ) {

          labelParts.push(

            `${dependency.delay_minutes}m`

          );

        }



        if (

          dependency.requirement_group

        ) {

          labelParts.push(

            dependency.requirement_group

          );

        }



        return {

          id:

            `${dependency.source}-` +

            `${dependency.target}-` +

            `${index}`,



          source:

            dependency.source,



          target:

            dependency.target,



          label:

            labelParts.join(" · "),



          animated: affected,



          markerEnd: {

            type:

              MarkerType.ArrowClosed,

          },



          className: affected

            ? "flow-edge affected"

            : "flow-edge",

        };

      }

    );

  }, [model, simulation, liveIncident]);





  const resultGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
  };

  const resultCardStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: 0,
    padding: "12px",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  const comparisonGridStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(92px, 1.25fr) minmax(62px, 0.8fr) minmax(62px, 0.8fr)",
    gap: "8px 12px",
    alignItems: "center",
    marginTop: "12px",
    padding: "12px",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  const impactStyle = {
    marginTop: "12px",
    padding: "12px",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  if (!clerkLoaded) {
    return <div style={{padding:40,fontFamily:"sans-serif"}}>Loading FRACTRA…</div>;
  }

  if (!isSignedIn) {
    return (
      <div className="fractra-auth-shell">
        <style>{`
          .fractra-auth-shell{min-height:100vh;display:grid;place-items:center;background:#f3efe5;padding:24px}
          .fractra-auth-wrap{display:grid;gap:16px;justify-items:center}
          .fractra-auth-brand{font-family:"DM Mono",monospace;letter-spacing:.18em;font-size:12px}
          .fractra-auth-switch{border:0;background:transparent;text-decoration:underline;cursor:pointer}
        `}</style>
        <div className="fractra-auth-wrap">
          <div className="fractra-auth-brand">FRACTRA · BREAK IT BEFORE REALITY DOES.</div>
          {authView === "signin" ? <SignIn /> : <SignUp />}
          <button className="fractra-auth-switch" onClick={() => setAuthView(authView === "signin" ? "signup" : "signin")}>
            {authView === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f3efe5",padding:24}}>
        <div style={{maxWidth:520}}>
          <h2>Choose your FRACTRA organisation</h2>
          <p>Create or select the workspace that owns these models, incidents and resilience branches.</p>
          <OrganizationSwitcher hidePersonal createOrganizationMode="modal" />
          <div style={{marginTop:20}}><CreateOrganization /></div>
        </div>
      </div>
    );
  }

  if (loading) {

    return (

      <div className="fractra">

        <div className="model-loading">

          <strong>

            FRACTRA

          </strong>



          <span>

            Loading resilience

            model...

          </span>

        </div>

      </div>

    );

  }





  return (

    <div className={`fractra ${liveIncident?.status === "active" ? "live-response-active" : ""}`}>
      <div className="workspace-control">
        <div className="workspace-context">
          <small>ACTIVE WORKSPACE</small>
          <strong>{organization?.name || "FRACTRA ORGANISATION"}</strong>
        </div>
        <OrganizationSwitcher hidePersonal />
        <UserButton />
      </div>
      <style>{`
        .workspace-control { position:fixed; top:12px; right:12px; z-index:1000; display:flex; gap:10px; align-items:center; background:#f7f2e8; padding:7px 9px 7px 12px; border:1px solid rgba(30,30,30,.2); box-shadow:0 6px 22px rgba(30,30,30,.06); }
        .workspace-context { display:flex; flex-direction:column; gap:2px; padding-right:10px; border-right:1px solid rgba(30,30,30,.16); }
        .workspace-context small { font-family:"DM Mono",monospace; font-size:8px; letter-spacing:.12em; opacity:.55; }
        .workspace-context strong { font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.04em; font-weight:600; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        @media (max-width:760px) { .workspace-context { display:none; } .workspace-control { top:8px; right:8px; } }
        /* BEFORE · judge-facing hierarchy */
        .before-hero-actions { display:flex; flex-wrap:wrap; gap:9px; align-items:center; }
        .before-blank-button { display:inline-flex; align-items:center; gap:8px; padding:11px 13px; border:1px solid rgba(30,30,30,.34); background:transparent; color:inherit; cursor:pointer; font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.06em; }
        .workspace-heading:not(.phase-hidden) { margin-top:22px; padding:34px 0 28px; border-top:1px solid rgba(30,30,30,.2); border-bottom:1px solid rgba(30,30,30,.2); }
        .workspace-heading:not(.phase-hidden) h1 { max-width:780px; line-height:.94; letter-spacing:-.035em; }
        .workspace-heading:not(.phase-hidden) .heading-side { max-width:430px; }
        .workspace-heading:not(.phase-hidden) .heading-side p { line-height:1.6; }
        .model-meta:not(.phase-hidden) { margin-top:18px; background:rgba(255,255,255,.18); }
        .model-toolbar:not(.phase-hidden) { margin-top:18px; padding-top:16px; border-top:2px solid #24211d; }
        .model-toolbar:not(.phase-hidden) > div:first-child span { font-size:11px; letter-spacing:.1em; }
        .flow-map:not(.phase-hidden) { min-height:560px; margin-top:0; border-width:2px; position:relative; background:rgba(255,255,255,.16); }
        .flow-map:not(.phase-hidden)::before { content:"DIGITAL TWIN · LIVE MODEL SURFACE"; position:absolute; top:12px; left:14px; z-index:4; font-family:"DM Mono",monospace; font-size:9px; letter-spacing:.12em; opacity:.5; pointer-events:none; }
        .break-me-workbench:not(.phase-hidden) { margin-top:28px; padding:28px; border:2px solid #24211d; background:rgba(30,30,30,.025); }
        .break-me-workbench:not(.phase-hidden) h2, .stress-workbench:not(.phase-hidden) h2 { margin:.3em 0; font-family:Georgia,serif; font-weight:400; line-height:1.05; }
        .break-me-workbench:not(.phase-hidden) h2 { font-size:clamp(28px,3vw,42px); }
        .stress-workbench:not(.phase-hidden) { margin-top:12px; border:1px solid rgba(30,30,30,.24); padding:22px 24px; }
        .stress-workbench:not(.phase-hidden) h2 { font-size:clamp(24px,2.5vw,34px); }
        .break-me-workbench .break-button { min-height:48px; }
        @media (max-width:760px) {
          .before-hero-actions { align-items:stretch; flex-direction:column; }
          .before-hero-actions button { width:100%; justify-content:center; }
          .workspace-heading:not(.phase-hidden) { padding:24px 0 20px; }
          .flow-map:not(.phase-hidden) { min-height:480px; }
          .break-me-workbench:not(.phase-hidden), .stress-workbench:not(.phase-hidden) { padding:18px; }
        }
        .flow-system.confirmed-failed { border:2px solid #b42318 !important; box-shadow:0 0 0 4px rgba(180,35,24,.12); }
        .flow-system.confirmed-degraded { border:2px solid #b7791f !important; box-shadow:0 0 0 4px rgba(183,121,31,.10); }
        .flow-system.confirmed-restored { border:2px solid #477a5b !important; }
        .flow-system.model-risk { border:2px dashed #b7791f !important; }
        .flow-system.conditional-risk { border:2px dashed #477a5b !important; box-shadow:0 0 0 3px rgba(71,122,91,.08); }
        .phase-hidden { display:none !important; }
        .lifecycle-nav { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:18px 0; }
        .lifecycle-button { border:1px solid rgba(30,30,30,.22); background:transparent; padding:12px 10px; text-align:left; cursor:pointer; }
        .lifecycle-button strong { display:block; font-size:12px; letter-spacing:.08em; }
        .lifecycle-button small { display:block; margin-top:4px; opacity:.62; }
        .lifecycle-button.active { background:#1f1f1d; color:#f4efe4; border-color:#1f1f1d; }
        .recover-workspace { border:1px solid rgba(30,30,30,.18); padding:24px; }
        .recover-workspace h2 { margin:7px 0 8px; font-family:Georgia,serif; font-size:clamp(30px,4vw,52px); font-weight:400; }
        .recover-lead { max-width:850px; font-size:15px; line-height:1.65; }
        .recover-basis { margin:18px 0; padding:14px 16px; border-left:3px solid #24211d; background:rgba(30,30,30,.035); }
        .recover-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:20px 0; }
        .recover-card { border:1px solid rgba(30,30,30,.2); padding:16px; min-height:125px; }
        .recover-card small { display:block; font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.08em; margin-bottom:8px; }
        .recover-card strong { display:block; font-family:Georgia,serif; font-size:30px; font-weight:400; }
        .recover-card p { margin:8px 0 0; font-size:12px; line-height:1.5; }
        .recover-action { margin:18px 0; }
        .recover-action button { padding:13px 17px; border:1px solid #24211d; background:#24211d; color:#f5efe3; cursor:pointer; font-family:"DM Mono",monospace; }
        .recover-table { margin-top:22px; border-top:1px solid rgba(30,30,30,.22); }
        .recover-row { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:12px; padding:12px 4px; border-bottom:1px solid rgba(30,30,30,.12); align-items:center; }
        .recover-row.header { font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.06em; }
        .recover-row strong { font-weight:600; }
        .recover-note { margin-top:18px; font-size:12px; opacity:.72; }
        .calibration-verdict { margin:22px 0; padding:20px; border:2px solid #24211d; }
        .calibration-verdict.insufficient { border-color:#8a3b2f; }
        .calibration-verdict.sufficient { border-color:#3f674f; }
        .calibration-verdict small { font-family:"DM Mono",monospace; letter-spacing:.08em; }
        .calibration-verdict h3 { margin:8px 0; font-family:Georgia,serif; font-size:28px; font-weight:400; }
        .calibration-error-list { margin-top:14px; border-top:1px solid rgba(30,30,30,.16); }
        .calibrate-again { margin-top:18px; padding-top:16px; border-top:1px solid rgba(30,30,30,.18); }
        .calibration-test { margin-top:12px; padding:14px; border:1px solid rgba(30,30,30,.22); }
        .calibration-test h4 { margin:0 0 6px; font-family:Georgia,serif; font-size:20px; font-weight:400; }
        .calibration-test pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; background:rgba(30,30,30,.04); padding:10px; }
        .calibration-test button { margin-right:8px; padding:10px 12px; border:1px solid #24211d; cursor:pointer; font-family:"DM Mono",monospace; }
        .version-chain { margin-top:18px; font-family:"DM Mono",monospace; font-size:11px; line-height:1.8; }
        .break-me-workbench {
          margin-top: 22px;
          padding: 24px;
          border: 2px solid rgba(30,30,30,.78);
          display: grid;
          grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr);
          gap: 24px;
        }
        .break-me-controls { display:flex; flex-direction:column; gap:14px; }
        .break-me-card {
          padding: 18px;
          border: 1px solid rgba(30,30,30,.22);
          background: rgba(30,30,30,.035);
        }
        .break-me-card h3 {
          margin: 8px 0 10px;
          font-family: Georgia, serif;
          font-size: 25px;
          font-weight: 400;
          line-height: 1.15;
        }
        .break-me-why {
          margin: 14px 0;
          padding-top: 12px;
          border-top: 1px solid rgba(30,30,30,.16);
        }
        .break-me-why strong {
          display:block;
          margin-bottom:6px;
          font-family:"DM Mono",monospace;
          font-size:10px;
          letter-spacing:.08em;
        }
        .break-me-facts {
          display:flex;
          flex-wrap:wrap;
          gap:8px 16px;
          margin:14px 0;
          font-family:"DM Mono",monospace;
          font-size:10px;
          letter-spacing:.05em;
        }
        @media (max-width: 800px) {
          .break-me-workbench { grid-template-columns: 1fr; }
        }
        .create-own-entry {
          margin: 18px 0 22px;
          padding: 20px 22px;
          border: 1px solid rgba(30,30,30,.22);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:22px;
        }
        .create-own-entry h2 { margin:5px 0 6px; font-family:Georgia,serif; font-weight:400; }
        .create-own-entry p { margin:0; max-width:720px; }
        .create-own-overlay {
          position:fixed; inset:0; z-index:1000;
          background:rgba(20,20,18,.52);
          display:flex; align-items:center; justify-content:center;
          padding:20px;
        }
        .create-own-modal {
          width:min(1100px,96vw); max-height:92vh; overflow:auto;
          background:#f4f0e6; border:2px solid #24231f;
          padding:24px;
          box-shadow:0 20px 70px rgba(0,0,0,.22);
        }
        .create-own-header {
          display:flex; justify-content:space-between; gap:20px;
          border-bottom:1px solid rgba(30,30,30,.2); padding-bottom:16px; margin-bottom:18px;
        }
        .create-own-header h2 { margin:5px 0 0; font-family:Georgia,serif; font-weight:400; }
        .create-own-form { display:grid; gap:14px; }
        .create-own-form label, .draft-system label, .draft-dependency label {
          display:grid; gap:5px; font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.06em;
        }
        .create-own-form input, .create-own-form textarea,
        .draft-system input, .draft-dependency input, .draft-dependency select {
          width:100%; box-sizing:border-box; padding:10px;
          border:1px solid rgba(30,30,30,.3); background:rgba(255,255,255,.35);
          font:inherit;
        }
        .review-warning { padding:14px; border:1px solid rgba(30,30,30,.25); margin-bottom:18px; }
        .review-warning p { margin:6px 0 0; }
        .draft-section { margin:20px 0; }
        .coverage-check {
          display:flex; justify-content:space-between; gap:16px;
          margin:0 0 14px; padding:12px 14px;
          border:1px solid rgba(30,30,30,.28);
          font-family:"DM Mono",monospace; font-size:11px;
        }
        .dependency-sentence {
          display:block; margin-top:5px; opacity:.72;
          font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.02em;
        }
        .source-evidence {
          display:block; margin-top:5px; opacity:.65;
          font-family:"DM Mono",monospace; font-size:9px; letter-spacing:.04em;
        }
        .dependency-rule {
          display:grid; gap:4px; margin-top:12px; padding-top:12px;
          border-top:1px solid rgba(30,30,30,.16);
        }
        .dependency-rule strong {
          font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.07em;
        }
        .draft-section-heading {
          display:flex; align-items:flex-end; justify-content:space-between;
          gap:18px; margin-bottom:12px;
        }
        .draft-section-heading h3 { margin:0 0 4px; }
        .draft-section-heading p { margin:0; opacity:.72; max-width:680px; }
        .draft-system-list, .draft-dependency-list {
          display:grid; gap:10px;
        }
        .draft-system-card, .draft-dependency-card {
          border:1px solid rgba(30,30,30,.2);
          padding:14px;
          background:rgba(255,255,255,.2);
        }
        .draft-card-top {
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; padding-bottom:10px; margin-bottom:10px;
          border-bottom:1px solid rgba(30,30,30,.12);
        }
        .draft-card-top strong { font-family:Georgia,serif; font-size:17px; font-weight:400; }
        .draft-fields {
          display:grid; grid-template-columns:1.5fr 1fr .55fr; gap:10px;
        }
        .draft-standby-row {
          display:flex; align-items:end; gap:18px; margin-top:10px;
        }
        .draft-check {
          display:flex !important; flex-direction:row !important;
          align-items:center; gap:7px !important;
        }
        .draft-check input { width:auto !important; }
        .draft-dependency-fields {
          display:grid; grid-template-columns:1fr auto 1fr .9fr .5fr .8fr;
          gap:10px; align-items:end;
        }
        .dependency-arrow {
          align-self:center; padding-top:16px; font-size:18px;
        }
        .draft-system-card input, .draft-dependency-card input,
        .draft-dependency-card select {
          width:100%; box-sizing:border-box; padding:9px;
          border:1px solid rgba(30,30,30,.3);
          background:rgba(255,255,255,.38);
          font:inherit;
        }
        .create-own-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:22px; }
        @media(max-width:800px) {
          .create-own-entry { align-items:flex-start; flex-direction:column; }
          .draft-section-heading { align-items:flex-start; flex-direction:column; }
          .draft-fields, .draft-dependency-fields { grid-template-columns:1fr; }
          .dependency-arrow { padding:0; transform:rotate(90deg); justify-self:start; }
          .draft-standby-row { align-items:flex-start; flex-direction:column; }
          .create-own-modal { padding:16px; }
        }

        .recover-storyline { display:grid; grid-template-columns:1fr auto 1fr auto 1fr auto 1fr; gap:9px; align-items:center; margin:22px 0 10px; }
        .recover-story-step { border:1px solid rgba(30,30,30,.18); padding:14px; min-height:76px; background:rgba(255,255,255,.18); }
        .recover-story-step small { display:block; font-size:9px; letter-spacing:.1em; opacity:.58; margin-bottom:7px; }
        .recover-story-step strong { font-family:Georgia,serif; font-size:17px; font-weight:400; line-height:1.2; }
        .recover-story-arrow { opacity:.35; font-size:17px; }
        .recover-basis strong { font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.08em; }
        .calibration-verdict { margin-top:22px; padding:20px; border:1px solid rgba(30,30,30,.2); background:rgba(255,255,255,.16); }
        .calibration-verdict.sufficient { border-left:4px solid #3f674f; }
        .calibration-verdict.insufficient { border-left:4px solid #b7791f; }
        .fix-after-learning { background:linear-gradient(180deg,rgba(63,103,79,.055),rgba(255,255,255,.08)); }
        .mitigation-result > strong { display:block; font-family:Georgia,serif; font-size:22px; font-weight:400; margin-bottom:8px; }

        .fix-after-learning { margin-top:22px; padding:20px; border:2px solid #3f674f; }
        .fix-after-learning h3 { margin:7px 0 8px; font-family:Georgia,serif; font-size:28px; font-weight:400; }
        .mitigation-card { margin-top:12px; padding:14px; border:1px solid rgba(30,30,30,.2); }
        .mitigation-result { margin-top:14px; padding:14px; background:rgba(30,30,30,.04); }


        .calibration-error-row { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:10px; padding:10px 0; border-bottom:1px solid rgba(30,30,30,.1); font-size:12px; }

        @media (max-width:800px) {

          .recover-storyline { grid-template-columns:1fr; }
          .recover-story-arrow { transform:rotate(90deg); justify-self:start; margin-left:14px; }
          .recover-grid { grid-template-columns:1fr; }
          .recover-row { grid-template-columns:1fr; gap:4px; }
          .recover-row.header { display:none; }
        }
        .phase-placeholder { border:1px solid rgba(30,30,30,.18); padding:28px; min-height:220px; display:flex; flex-direction:column; justify-content:center; }
        .phase-placeholder h2 { margin:7px 0; font-family:Georgia,serif; font-size:clamp(28px,4vw,48px); font-weight:400; }
        .phase-placeholder p { max-width:700px; }
        .reality-diff { border:1px solid rgba(30,30,30,.18); padding:clamp(18px,3vw,30px); background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.08)); }
        .diff-head { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; flex-wrap:wrap; }
        .diff-head h2 { margin:6px 0; font-family:Georgia,serif; font-size:clamp(30px,4vw,52px); font-weight:400; }
        .diff-storyline { display:grid; grid-template-columns:1fr auto 1fr auto 1fr; gap:10px; align-items:center; margin:20px 0 8px; }
        .diff-story-step { border:1px solid rgba(30,30,30,.18); padding:14px; min-height:78px; background:rgba(255,255,255,.18); }
        .diff-story-step small { display:block; font-size:9px; letter-spacing:.11em; opacity:.55; margin-bottom:6px; }
        .diff-story-step strong { font-family:Georgia,serif; font-size:18px; font-weight:400; }
        .diff-story-arrow { opacity:.38; font-size:18px; }
        .diff-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:12px 0 20px; }
        .diff-stat { border:1px solid rgba(30,30,30,.16); padding:14px; background:rgba(255,255,255,.18); }
        .diff-stat strong { display:block; font-size:24px; }
        .diff-stat small { font-size:9px; letter-spacing:.07em; opacity:.65; }
        .diff-method { font-size:11px; opacity:.65; max-width:760px; margin-bottom:18px; }
        .diff-item { border:1px solid rgba(30,30,30,.14); padding:16px; margin:10px 0; background:rgba(255,255,255,.16); }
        .diff-item.matched { opacity:.78; }
        .diff-item.gap { border-left:4px solid #b7791f; }
        .diff-item-head { display:flex; justify-content:space-between; gap:12px; align-items:center; }
        .diff-badge { font-size:9px; letter-spacing:.07em; border:1px solid rgba(30,30,30,.25); padding:5px 7px; }
        .diff-columns { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; }
        .diff-column { border:1px solid rgba(30,30,30,.12); padding:12px; }
        .diff-column small { display:block; opacity:.58; margin-bottom:5px; letter-spacing:.06em; }
        .model-gap { margin-top:10px; padding:10px 12px; border-left:3px solid #b7791f; background:rgba(183,121,31,.05); font-size:12px; }
        .gap-review { margin-top:14px; border:1px solid rgba(30,30,30,.18); padding:16px; background:rgba(183,121,31,.035); }
        .gap-review h4 { margin:0 0 8px; }
        .gap-hypothesis { padding:8px 0; border-top:1px solid rgba(30,30,30,.08); font-size:12px; }
        .proposal { margin-top:10px; padding:12px; background:rgba(30,30,30,.035); border:1px solid rgba(30,30,30,.12); }
        .proposal textarea { width:100%; min-height:118px; margin-top:8px; font-family:"DM Mono",monospace; font-size:11px; }
        .proposal-actions { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
        .decision { font-size:10px; letter-spacing:.06em; margin-top:7px; }
        .learning-gate { margin:22px 0 10px; padding:14px 16px; border-top:1px solid rgba(30,30,30,.22); border-bottom:1px solid rgba(30,30,30,.22); font-size:11px; letter-spacing:.03em; }
        .branch-box { margin-top:14px; padding:20px; border:1px solid rgba(30,30,30,.28); background:rgba(255,255,255,.22); }
        .branch-box h3 { margin:4px 0 8px; font-family:Georgia,serif; font-size:28px; font-weight:400; }
        /* DURING · incident command centre */
        .live-response-band { margin:18px 0 0; border:2px solid rgba(120,30,20,.55); background:rgba(120,30,20,.035); padding:24px; }
        .live-response-head { display:flex; justify-content:space-between; gap:22px; align-items:flex-start; flex-wrap:wrap; padding-bottom:18px; border-bottom:1px solid rgba(30,30,30,.18); }
        .live-response-head h2 { margin:7px 0 5px; font-family:Georgia,serif; font-size:clamp(30px,4vw,48px); font-weight:400; line-height:1; }
        .live-response-head p { margin:0; opacity:.68; }
        .live-badge { display:inline-flex; align-items:center; gap:8px; font-family:"DM Mono",monospace; font-size:10px; font-weight:800; letter-spacing:.1em; }
        .live-dot { width:8px; height:8px; border-radius:50%; background:#b42318; display:inline-block; box-shadow:0 0 0 5px rgba(180,35,24,.1); }
        .live-command-meta { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
        .live-clock { font-family:"DM Mono",monospace; font-size:clamp(25px,3vw,38px); letter-spacing:.02em; margin:16px 0 10px; font-variant-numeric:tabular-nums; }
        .live-clock::before { content:"INCIDENT CLOCK  "; display:block; margin-bottom:3px; font-size:8px; letter-spacing:.14em; opacity:.5; }
        .live-overview { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:0; margin:14px 0 22px; border:1px solid rgba(30,30,30,.24); }
        .live-stat { padding:13px 12px; min-height:58px; border-right:1px solid rgba(30,30,30,.14); background:rgba(255,255,255,.16); }
        .live-stat:last-child { border-right:0; }
        .live-stat strong { display:block; font-family:Georgia,serif; font-size:26px; font-weight:400; line-height:1; }
        .live-stat small { display:block; margin-top:7px; font-family:"DM Mono",monospace; font-size:8px; letter-spacing:.08em; opacity:.62; }
        .live-priorities { margin:0 0 20px; border:1px solid rgba(30,30,30,.22); border-left:4px solid #b42318; padding:16px 18px; background:rgba(255,255,255,.18); }
        .live-priorities > strong { display:block; font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.1em; margin-bottom:6px; }
        .live-priority { display:flex; justify-content:space-between; gap:16px; padding:10px 0; border-bottom:1px solid rgba(30,30,30,.1); font-size:12px; }
        .live-priority:last-child { border-bottom:0; padding-bottom:0; }
        .live-priority small { white-space:nowrap; font-family:"DM Mono",monospace; opacity:.58; }
        .live-grid { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr); gap:16px; margin-top:16px; }
        .live-card { border:1px solid rgba(30,30,30,.2); padding:20px; min-width:0; background:rgba(255,255,255,.14); }
        .live-card > strong { font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.1em; }
        .live-card > p { line-height:1.55; opacity:.72; }
        .live-card label { display:flex; flex-direction:column; gap:7px; margin:14px 0; font-family:"DM Mono",monospace; font-size:9px; font-weight:700; letter-spacing:.08em; }
        .live-card input,.live-card select,.live-card textarea { width:100%; box-sizing:border-box; padding:11px; border:1px solid rgba(30,30,30,.28); background:#f7f2e8; color:inherit; }
        .live-selected { margin:12px 0; padding:12px 14px; border-left:3px solid #24211d; background:rgba(30,30,30,.04); }
        .live-selected small { display:block; font-family:"DM Mono",monospace; font-size:8px; letter-spacing:.1em; opacity:.55; }
        .live-selected strong { display:block; margin-top:4px; font-family:Georgia,serif; font-size:20px; font-weight:400; }
        .live-buttons { display:flex; flex-wrap:wrap; gap:8px; }
        .live-buttons button,.live-response-band button { padding:10px 12px; cursor:pointer; font-family:"DM Mono",monospace; font-size:9px; letter-spacing:.05em; }
        .live-timeline { max-height:390px; overflow:auto; display:flex; flex-direction:column; margin-top:12px; padding-left:16px; border-left:1px solid rgba(30,30,30,.2); }
        .live-event { position:relative; padding:0 0 16px 14px; font-size:12px; }
        .live-event::before { content:""; position:absolute; left:-20px; top:5px; width:7px; height:7px; border-radius:50%; background:#24211d; }
        .live-event small { display:block; margin-bottom:4px; font-family:"DM Mono",monospace; font-size:8px; letter-spacing:.06em; opacity:.55; }
        .live-event strong { font-size:11px; letter-spacing:.035em; }
        .live-event p { margin:5px 0 0; line-height:1.45; opacity:.72; }
        .live-event.start::before { background:#b42318; }
        .model-risk-note { margin-top:14px; padding-top:12px; border-top:1px solid rgba(30,30,30,.12); font-family:"DM Mono",monospace; font-size:9px; line-height:1.55; opacity:.68; }
        .reality-legend { display:flex; flex-wrap:wrap; gap:8px 16px; margin:4px 0 18px; font-family:"DM Mono",monospace; font-size:8px; letter-spacing:.06em; }
        .reality-legend span { display:inline-flex; align-items:center; gap:6px; }
        .legend-solid,.legend-risk,.legend-conditional { width:18px; height:0; border-top:2px solid #24211d; }
        .legend-risk { border-top:2px dashed #b7791f; }
        .legend-conditional { border-top:2px dashed #477a5b; }
        .flow-system[data-live-selected="true"] { outline:3px solid rgba(30,30,30,.18); outline-offset:4px; }
        .end-confirm { margin:12px 0 18px; border:2px solid rgba(180,35,24,.42); padding:16px; background:rgba(180,35,24,.04); }
        .flow-system.confirmed-contained,.flow-system.confirmed-temporary_service { border:2px solid #7a642f !important; }
        .flow-system.confirmed-verified { border:2px solid #477a5b !important; box-shadow:0 0 0 3px rgba(71,122,91,.08); }
        @media (max-width:900px) { .live-overview { grid-template-columns:repeat(3,minmax(0,1fr)); } .live-stat:nth-child(3) { border-right:0; } .live-stat:nth-child(-n+3) { border-bottom:1px solid rgba(30,30,30,.14); } }
        @media (max-width:760px) { .diff-storyline { grid-template-columns:1fr; } .diff-story-arrow { transform:rotate(90deg); text-align:center; } .live-response-band { padding:16px; } .live-grid { grid-template-columns:1fr; } .live-overview { grid-template-columns:repeat(2,minmax(0,1fr)); } .live-stat:nth-child(3) { border-right:1px solid rgba(30,30,30,.14); } .live-stat:nth-child(2n) { border-right:0; } .live-stat:nth-child(-n+4) { border-bottom:1px solid rgba(30,30,30,.14); } .live-priority { flex-direction:column; gap:4px; } .diff-summary,.diff-columns { grid-template-columns:1fr; } .lifecycle-nav { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        /* FINAL WHOLE-APP POLISH */
        .builder-error { position:sticky; top:74px; z-index:900; box-shadow:0 8px 24px rgba(30,30,30,.08); }
        .lifecycle-button { min-height:58px; transition:background .16s ease,color .16s ease,border-color .16s ease; }
        .lifecycle-button:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline:2px solid #24211d; outline-offset:2px; }
        .fractra-header-logo { display:block; width:auto; height:46px; max-width:min(300px,32vw); object-fit:contain; object-position:left center; }
        .model-selector select { max-width:min(420px,52vw); text-overflow:ellipsis; }
        @media (max-width:760px) {
          .fractra-header-logo { height:36px; max-width:170px; }
          .workspace { overflow-x:hidden; }
          .model-selector { align-items:stretch; }
          .model-selector select { width:100%; max-width:none; }
          .recover-workspace { padding:16px; }
          .recover-grid { grid-template-columns:1fr; }
          .recover-row { grid-template-columns:1fr; gap:5px; padding:14px 4px; }
          .recover-row.header { display:none; }
          .workspace-control { max-width:calc(100vw - 16px); }
        }
      `}</style>

      <header className="topbar">



        <div className="identity">

          <img
            src="/fractra-logo.png"
            alt="FRACTRA — Break it before reality does."
            className="fractra-header-logo"
          />

        </div>





        <div className="model-selector">



          <span>

            ACTIVE MODEL

          </span>



          <select

            value={

              model?.organization?.id ||

              ""

            }



            onChange={(event) =>

              loadModel(

                event.target.value

              )

            }

          >

            {models.map((item) => (

              <option

                key={item.id}

                value={item.id}

              >

                {item.demo ? `DEMO · ${item.name}` : item.name}

              </option>

            ))}

          </select>



        </div>





        <div

          className={`system-state ${

            simulation

              ? "danger"

              : ""

          }`}

        >

          <i />



          {liveIncident?.status === "active"
            ? "LIVE INCIDENT"
            : simulation
            ? "SYSTEM DISRUPTED"
            : "SYSTEM STABLE"}

        </div>



      </header>





      <main className="workspace">



        <nav className="lifecycle-nav" aria-label="FRACTRA lifecycle">
          {[
            ["before", "BEFORE", "Prepare + simulate"],
            ["during", "DURING", "Live response"],
            ["after", "AFTER", "Reality diff"],
            ["recover", "RECOVER", "Improve + replay"],
          ].map(([id, label, description]) => (
            <button
              key={id}
              type="button"
              className={`lifecycle-button ${activePhase === id ? "active" : ""}`}
              onClick={() => setActivePhase(id)}
            >
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </nav>

        <section className={`workspace-heading ${activePhase === "before" ? "" : "phase-hidden"}`}>



          <div>



            <span className="index">

              BEFORE / DIGITAL TWIN

            </span>



            <h1>

              See what breaks

              <br />

              before reality does.

            </h1>



          </div>





          <div className="heading-side">



            <p>

              Your organisation becomes an executable dependency model.
              Test a failure, watch the cascade, and find the response window
              before a real incident forces the lesson.

            </p>



            <div className="before-hero-actions">
              <button
                className="create-model-button"
                onClick={() => setCreateOwnOpen(true)}
              >
                <Zap size={15} />
                CREATE DIGITAL TWIN
              </button>
              <button
                className="before-blank-button"
                onClick={() => setPanel("organization")}
              >
                <Plus size={15} />
                START BLANK MODEL
              </button>
            </div>



          </div>



        </section>





        {error && (

          <div className="builder-error">



            <span>

              {error}

            </span>



            <button

              onClick={() =>

                setError("")

              }

            >

              <X size={15} />

            </button>



          </div>

        )}





        {model && (

          <>



            <section className={`model-meta ${activePhase === "before" ? "" : "phase-hidden"}`}>



              <div>

                <span>

                  ENVIRONMENT

                </span>



                <strong>

                  {model.organization.demo

                    ? "DEMO"

                    : "CUSTOM"}

                </strong>

              </div>





              <div>

                <span>

                  ORGANIZATION

                </span>



                <strong>

                  {

                    model.organization

                      .name

                  }

                </strong>

              </div>





              <div>

                <span>

                  SYSTEMS

                </span>



                <strong>

                  {

                    model.systems

                      .length

                  }

                </strong>

              </div>





              <div>

                <span>

                  DEPENDENCIES

                </span>



                <strong>

                  {

                    model.dependencies

                      .length

                  }

                </strong>

              </div>



            </section>





            <section className={`model-toolbar ${activePhase === "before" ? "" : "phase-hidden"}`}>



              <div>

                <span>

                  EXECUTABLE DEPENDENCY GRAPH

                </span>



                <small>

                  Digital Twin · structure before simulation.

                </small>

              </div>





              <div className="model-tools">



                <button

                  onClick={() =>

                    setPanel("system")

                  }

                >

                  <Plus size={15} />



                  ADD SYSTEM

                </button>





                <button
                  onClick={() => {
                    if (model.systems.length === 1) {
                      openSystemEditor(model.systems[0]);
                    } else {
                      setPanel("choose-system");
                    }
                  }}
                  disabled={model.systems.length === 0}
                >
                  <Pencil size={15} />

                  IMPLEMENT FIX
                </button>





                <button

                  onClick={() =>

                    setPanel(

                      "dependency"

                    )

                  }



                  disabled={

                    model.systems

                      .length < 2

                  }

                >

                  <Link2 size={15} />



                  CONNECT SYSTEMS

                </button>



              </div>



            </section>





            <section className={`flow-map ${activePhase === "before" || activePhase === "during" ? "" : "phase-hidden"}`}>



              {model.systems.length ===

              0 ? (



                <div className="empty-model">



                  <span>

                    EMPTY MODEL

                  </span>



                  <h2>

                    Start with the systems

                    this organization

                    depends on.

                  </h2>



                  <button

                    onClick={() =>

                      setPanel(

                        "system"

                      )

                    }

                  >

                    <Plus size={16} />



                    ADD FIRST SYSTEM

                  </button>



                </div>



              ) : (



                <ReactFlow

                  nodes={nodes}

                  edges={edges}

                  nodeTypes={

                    nodeTypes

                  }



                  fitView



                  fitViewOptions={{

                    padding: 0.25,

                  }}



                  nodesDraggable

                  nodesConnectable={

                    false

                  }



                  elementsSelectable



                  minZoom={0.4}

                  maxZoom={1.5}



                >



                  <Background

                    gap={28}

                    size={1}

                  />



                  <Controls

                    showInteractive={

                      false

                    }

                  />



                </ReactFlow>



              )}



            </section>





            <section className={`live-response-band ${activePhase === "during" ? "" : "phase-hidden"}`}>
              {!liveIncident ? (
                <div className="live-response-head">
                  <div>
                    <span className="index">02 / LIVE RESPONSE</span>
                    <h2>When simulation becomes reality.</h2>
                    <p>
                      Start a real incident against this same dependency model.
                      Confirmed observations stay separate from model-derived risk.
                    </p>
                  </div>

                  <form onSubmit={startLiveIncident} className="live-card">
                    <label>
                      INCIDENT NAME
                      <input
                        required
                        placeholder="e.g. Hospital power outage"
                        value={liveForm.name}
                        onChange={(event) =>
                          setLiveForm({ ...liveForm, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      INCIDENT TYPE
                      <select
                        value={liveForm.type}
                        onChange={(event) =>
                          setLiveForm({ ...liveForm, type: event.target.value })
                        }
                      >
                        <option value="power-outage">Power outage</option>
                        <option value="cyberattack">Cyberattack</option>
                        <option value="fire">Fire</option>
                        <option value="flood">Flood</option>
                        <option value="earthquake">Earthquake</option>
                        <option value="supply-failure">Supply failure</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      INITIAL NOTE
                      <textarea
                        rows="2"
                        placeholder="What is known right now?"
                        value={liveForm.note}
                        onChange={(event) =>
                          setLiveForm({ ...liveForm, note: event.target.value })
                        }
                      />
                    </label>
                    <button type="submit" disabled={liveLoading}>
                      <Activity size={15} />{" "}
                      {liveLoading ? "STARTING..." : "ENTER LIVE RESPONSE"}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div className="live-response-head">
                    <div>
                      <span className="live-badge">
                        <i className="live-dot" />
                        {liveIncident.status === "active"
                          ? "LIVE · INCIDENT COMMAND"
                          : "INCIDENT ENDED · RECORD FROZEN"}
                      </span>
                      <h2>{liveIncident.name}</h2>
                      <p>
                        {String(liveIncident.type || "incident").replaceAll("-", " ").toUpperCase()}
                        {" · "}Started {new Date(liveIncident.started_at).toLocaleString()}
                        {" · "}Workspace {organization?.name || "FRACTRA"}
                      </p>
                    </div>
                    {liveIncident.status === "active" && (
                      <button
                        type="button"
                        onClick={() => setConfirmEndIncident(true)}
                        disabled={liveLoading}
                      >
                        END INCIDENT →
                      </button>
                    )}
                  </div>

                  <div className="live-clock">
                    {liveIncident.status === "active"
                      ? formatElapsed(liveNow)
                      : `ENDED · ${formatElapsed(liveIncident.ended_at)}`}
                  </div>

                  {(() => {
                    const overview = liveOverview();
                    return (
                      <div className="live-overview">
                        <div className="live-stat"><strong>{overview.failed}</strong><small>FAILED</small></div>
                        <div className="live-stat"><strong>{overview.degraded}</strong><small>DEGRADED</small></div>
                        <div className="live-stat"><strong>{overview.recovering}</strong><small>RECOVERING</small></div>
                        <div className="live-stat"><strong>{overview.restored}</strong><small>RESTORED / VERIFIED</small></div>
                        <div className="live-stat"><strong>{overview.risk}</strong><small>MODEL RISK</small></div>
                        <div className="live-stat"><strong>{overview.conditional}</strong><small>CONDITIONAL</small></div>
                      </div>
                    );
                  })()}

                  {liveIncident.status === "active" && livePriorities().length > 0 && (
                    <div className="live-priorities">
                      <strong>WHAT NEEDS ATTENTION NOW</strong>
                      {livePriorities().map((item) => (
                        <div className="live-priority" key={`${item.level}-${item.system.id}`}>
                          <span>{item.text}</span>
                          <small>CRITICALITY {item.system.criticality || "—"}</small>
                        </div>
                      ))}
                    </div>
                  )}

                  {confirmEndIncident && liveIncident.status === "active" && (
                    <div className="end-confirm">
                      <strong>FREEZE THIS INCIDENT RECORD?</strong>
                      <p>
                        Ending the incident freezes this factual timeline for AFTER / Reality Diff.
                      </p>
                      <div className="live-buttons">
                        <button
                          type="button"
                          onClick={async () => {
                            await endLiveIncident();
                          }}
                          disabled={liveLoading}
                        >
                          YES · END AND FREEZE
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmEndIncident(false)}
                          disabled={liveLoading}
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="live-grid">
                    <div className="live-card">
                      <strong>CONFIRM SYSTEM STATE</strong>
                      <p>
                        Record only what has actually been observed. Click a system directly
                        on the graph or choose it below. Dashed nodes are model risk, not confirmed failures.
                      </p>
                      {liveSelectedSystem && (
                        <div className="live-selected">
                          <small>SELECTED SYSTEM</small>
                          <strong>{model.systems.find((system) => system.id === liveSelectedSystem)?.name || liveSelectedSystem}</strong>
                        </div>
                      )}
                      <label>
                        SYSTEM
                        <select
                          value={liveSelectedSystem}
                          onChange={(event) => setLiveSelectedSystem(event.target.value)}
                          disabled={liveIncident.status !== "active"}
                        >
                          <option value="">Select observed system</option>
                          {model.systems.map((system) => (
                            <option key={system.id} value={system.id}>{system.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        OBSERVATION NOTE
                        <textarea
                          rows="2"
                          placeholder="Optional evidence or context"
                          value={liveNote}
                          onChange={(event) => setLiveNote(event.target.value)}
                          disabled={liveIncident.status !== "active"}
                        />
                      </label>
                      <div className="live-buttons">
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("failed")}>
                          CONFIRMED FAILED
                        </button>
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("degraded")}>
                          CONFIRMED DEGRADED
                        </button>
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("contained")}>
                          CONTAINED
                        </button>
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("temporary_service")}>
                          TEMPORARY SERVICE
                        </button>
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("restored")}>
                          RESTORED
                        </button>
                        <button type="button" disabled={!liveSelectedSystem || liveLoading || liveIncident.status !== "active"} onClick={() => recordLiveObservation("verified")}>
                          VERIFIED
                        </button>
                      </div>
                      <div className="reality-legend" aria-label="Live incident map legend">
                        <span><i className="legend-solid" /> CONFIRMED REALITY</span>
                        <span><i className="legend-risk" /> MODEL RISK</span>
                        <span><i className="legend-conditional" /> CONDITIONAL / REDUNDANCY</span>
                      </div>
                      <p className="model-risk-note">
                        Predictions never become confirmed facts automatically. FRACTRA only changes a system to a confirmed state when a human records an observation.
                      </p>
                    </div>

                    <div className="live-card">
                      <strong>LIVE INCIDENT TIMELINE</strong>
                      <div className="live-timeline">
                        <div className="live-event start">
                          <small>T+00:00 · {new Date(liveIncident.started_at).toLocaleTimeString()}</small>
                          <div><strong>INCIDENT STARTED</strong><p>{liveIncident.note || "Live response record opened."}</p></div>
                        </div>
                        {[
                          ...(liveIncident.observations || []).map((item) => ({ ...item, kind: "observation" })),
                          ...(liveIncident.actions || []).map((item) => ({ ...item, kind: "action" })),
                        ]
                          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                          .map((item) => (
                            <div className="live-event" key={item.id}>
                              <small>{formatElapsed(item.timestamp)} · {new Date(item.timestamp).toLocaleTimeString()}</small>
                              {item.kind === "observation" ? (
                                <div>
                                  <strong>{item.system_name} · {item.state.toUpperCase()}</strong>
                                  {item.note && <p>{item.note}</p>}
                                </div>
                              ) : (
                                <div><strong>RESPONSE ACTION</strong><p>{item.description}</p></div>
                              )}
                            </div>
                          ))}
                      </div>

                      {liveIncident.status === "active" && (
                        <form onSubmit={recordLiveAction}>
                          <label>
                            RECORD RESPONSE ACTION
                            <input
                              placeholder="e.g. Facilities team dispatched"
                              value={liveAction}
                              onChange={(event) => setLiveAction(event.target.value)}
                            />
                          </label>
                          <button type="submit" disabled={!liveAction.trim() || liveLoading}>
                            ADD TO TIMELINE
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>


            <section className={`break-me-workbench ${activePhase === "before" ? "" : "phase-hidden"}`}>
              <div className="stress-copy">
                <span>03 / AI-GUIDED STRESS TEST</span>
                <h2>Let Apertus choose what to break.</h2>
                <p>
                  Find a failure worth testing next. Apertus examines the
                  current dependency model and selects one grounded initiating
                  disruption. It does not decide what fails downstream.
                </p>
              </div>

              <div className="break-me-controls">
                <button
                  className="break-button"
                  disabled={breakMeLoading || simulating || liveIncident?.status === "active"}
                  onClick={generateBreakMeChallenge}
                >
                  <Zap size={17} />
                  {breakMeLoading ? "APERTUS IS EXAMINING THE MODEL..." : "CHALLENGE THIS ORGANISATION"}
                  <ArrowRight size={16} />
                </button>

                {breakMeChallenge && (
                  <div className="break-me-card">
                    <small>APERTUS SELECTED · FRACTRA GROUNDED</small>
                    <h3>{breakMeChallenge.challenge}</h3>
                    <div className="break-me-why">
                      <strong>WHY TEST THIS?</strong>
                      <p>{breakMeChallenge.why_test}</p>
                    </div>
                    <div className="break-me-facts">
                      <span>INITIATOR · {breakMeChallenge.system_name}</span>
                      <span>CRITICALITY · {breakMeChallenge.grounding?.criticality}/5</span>
                      <span>DOWNSTREAM REACH · {breakMeChallenge.grounding?.downstream_reach}</span>
                    </div>
                    <p className="recover-note">{breakMeChallenge.authority}</p>
                    <button
                      className="break-button"
                      disabled={simulating || liveIncident?.status === "active"}
                      onClick={runBreakMeChallenge}
                    >
                      {simulating ? "SIMULATING..." : "RUN CHALLENGE"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </section>


            <section className={`stress-workbench ${activePhase === "before" ? "" : "phase-hidden"}`}>



              <div className="stress-copy">



                <span>

                  04 / MANUAL STRESS TEST

                </span>



                <h2>

                  Or choose the failure yourself.

                </h2>



                <p>

                  Choose the initiating

                  failure. FRACTRA will

                  calculate everything

                  that follows from the

                  dependency model.

                </p>



              </div>





              <div className="stress-controls">



                <label>



                  SYSTEM TO BREAK



                  <select

                    value={

                      selectedSystem

                    }



                    onChange={(event) =>

                      setSelectedSystem(

                        event.target

                          .value

                      )

                    }

                  >



                    <option value="">

                      Select a system

                    </option>



                    {model.systems.map(

                      (system) => (



                        <option

                          key={

                            system.id

                          }



                          value={

                            system.id

                          }

                        >

                          {

                            system.name

                          }

                        </option>



                      )

                    )}



                  </select>



                </label>





                <button

                  className="break-button"



                  disabled={

                    !selectedSystem ||

                    simulating ||
                    liveIncident?.status === "active"

                  }



                  onClick={() =>

                    runStressTest()

                  }

                >

                  <Zap size={17} />



                  {simulating

                    ? "SIMULATING..."

                    : "BREAK SYSTEM"}



                  <ArrowRight

                    size={16}

                  />

                </button>



              </div>



            </section>



          </>

        )}




      {createOwnOpen && (
        <div className="create-own-overlay">
          <section className="create-own-modal">
            <div className="create-own-header">
              <div>
                <small>CREATE YOUR OWN · HUMAN REVIEW REQUIRED</small>
                <h2>Turn your organisation into an executable model.</h2>
              </div>
              <button className="icon-button" onClick={() => setCreateOwnOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {createOwnStage === "describe" && (
              <form className="create-own-form" onSubmit={proposeOwnInventory}>
                <label>
                  ORGANISATION NAME
                  <input value={createOwnForm.name}
                    onChange={(e) => setCreateOwnForm({...createOwnForm, name:e.target.value})}
                    placeholder="e.g. Northstar Community Clinic" required />
                </label>
                <label>
                  ORGANISATION TYPE
                  <input value={createOwnForm.type}
                    onChange={(e) => setCreateOwnForm({...createOwnForm, type:e.target.value})}
                    placeholder="e.g. clinic, logistics company, school" />
                </label>
                <label>
                  DESCRIBE HOW IT WORKS
                  <textarea rows="8" value={createOwnForm.description}
                    onChange={(e) => setCreateOwnForm({...createOwnForm, description:e.target.value})}
                    placeholder="Describe important systems, services, backups and dependencies."
                    required />
                </label>
                <p className="recover-note">
                  Step 1 of 3 · Apertus suggests candidate components. You decide when the inventory is complete.
                </p>
                <button className="break-button" disabled={createOwnLoading}>
                  {createOwnLoading ? "EXTRACTING..." : "SUGGEST COMPONENTS"} <ArrowRight size={16} />
                </button>
              </form>
            )}

            {createOwnStage === "inventory" && (
              <div className="create-own-review">
                <div className="review-warning">
                  <strong>AI DRAFT · VERIFY YOUR ORGANISATION</strong>
                  <p>{createOwnNotice}</p>
                  <p><strong>Do not lock this list until every important component is present.</strong></p>
                </div>

                <div className="draft-section-heading">
                  <div>
                    <h3>COMPONENT INVENTORY · {createOwnInventory.length}</h3>
                    <p>Add anything Apertus missed. Rename or remove anything incorrect.</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={addInventorySystem}>
                    + ADD SYSTEM
                  </button>
                </div>

                <div className="draft-system-list">
                  {createOwnInventory.map((system, index) => (
                    <article className="draft-system-card" key={`${system.id}-${index}`}>
                      <div className="draft-card-top">
                        <div>
                          <strong>{system.name}</strong>
                          {system.source_evidence && (
                            <small className="source-evidence">
                              {system.source_evidence === "Added by human reviewer"
                                ? "HUMAN ADDED"
                                : `AI FOUND · “${system.source_evidence}”`}
                            </small>
                          )}
                        </div>
                        <button className="icon-button" type="button"
                          onClick={() => removeInventorySystem(index)}>
                          <X size={15} />
                        </button>
                      </div>
                      <label>
                        SYSTEM NAME
                        <input value={system.name}
                          onChange={(e) => updateInventorySystem(index, "name", e.target.value)} />
                      </label>
                    </article>
                  ))}
                </div>

                <div className="create-own-actions">
                  <button className="secondary-button" type="button"
                    onClick={() => setCreateOwnStage("describe")}>
                    BACK TO DESCRIPTION
                  </button>
                  <button className="break-button" type="button"
                    disabled={createOwnLoading || createOwnInventory.length < 2}
                    onClick={lockInventoryAndBuildRelationships}>
                    {createOwnLoading
                      ? "BUILDING RELATIONSHIPS..."
                      : `LOCK ${createOwnInventory.length} SYSTEMS →`}
                  </button>
                </div>
              </div>
            )}

            {createOwnStage === "relationships" && createOwnDraft && (
              <div className="create-own-review">
                <div className="review-warning">
                  <strong>RELATIONSHIP REVIEW · INVENTORY LOCKED</strong>
                  <p>{createOwnNotice}</p>
                  <div className="dependency-rule">
                    <strong>HOW TO READ EVERY ARROW</strong>
                    <span>SOURCE → TARGET means: if SOURCE is lost, TARGET is affected.</span>
                  </div>
                </div>

                <div className="draft-section">
                  <div className="draft-section-heading">
                    <div>
                      <h3>LOCKED SYSTEMS · {createOwnDraft.systems.length}</h3>
                      <p>The inventory cannot be changed in this stage. Go back if a system is missing.</p>
                    </div>
                  </div>
                  <div className="draft-system-list">
                    {createOwnDraft.systems.map((system, index) => (
                      <article className="draft-system-card" key={`${system.id}-${index}`}>
                        <div className="draft-card-top"><strong>{system.name}</strong></div>
                        <div className="draft-fields">
                          <label>CATEGORY
                            <input value={system.category}
                              onChange={(e) => updateDraftSystem(index, "category", e.target.value)} />
                          </label>
                          <label>CRITICALITY · 1–5
                            <input type="number" min="1" max="5" value={system.criticality}
                              onChange={(e) => updateDraftSystem(index, "criticality", e.target.value)} />
                          </label>
                          <label className="draft-check">
                            <input type="checkbox" checked={Boolean(system.standby)}
                              onChange={(e) => updateDraftSystem(index, "standby", e.target.checked)} />
                            STANDBY
                          </label>
                        </div>
                        {system.standby && (
                          <label>MAX RUNTIME · MINUTES
                            <input type="number" min="1" value={system.max_runtime_minutes ?? ""}
                              onChange={(e) => updateDraftSystem(index, "max_runtime_minutes", e.target.value)} />
                          </label>
                        )}
                      </article>
                    ))}
                  </div>
                </div>

                <div className="draft-section">
                  <div className="draft-section-heading">
                    <div>
                      <h3>DEPENDENCIES · {createOwnDraft.dependencies.length}</h3>
                      <p>Read the sentence on every card. If it sounds backwards, change the source and target.</p>
                    </div>
                    <button className="secondary-button" type="button" onClick={addDraftDependency}>
                      + ADD DEPENDENCY
                    </button>
                  </div>

                  <div className="draft-dependency-list">
                    {createOwnDraft.dependencies.map((dep, index) => {
                      const sourceName = createOwnDraft.systems.find((s) => s.id === dep.source)?.name || dep.source;
                      const targetName = createOwnDraft.systems.find((s) => s.id === dep.target)?.name || dep.target;
                      return (
                        <article className="draft-dependency-card" key={`${dep.source}-${dep.target}-${index}`}>
                          <div className="draft-card-top">
                            <div>
                              <strong>{sourceName} → {targetName}</strong>
                              <small className="dependency-sentence">
                                If {sourceName} is lost, {targetName} {dep.failure_effect === "degraded" ? "is degraded" : "fails"}.
                              </small>
                            </div>
                            <button className="icon-button" type="button"
                              onClick={() => removeDraftDependency(index)}>
                              <X size={15} />
                            </button>
                          </div>
                          <div className="draft-dependency-fields">
                            <label>SOURCE
                              <select value={dep.source}
                                onChange={(e) => updateDraftDependency(index,"source",e.target.value)}>
                                {createOwnDraft.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </label>
                            <span className="dependency-arrow">→</span>
                            <label>TARGET
                              <select value={dep.target}
                                onChange={(e) => updateDraftDependency(index,"target",e.target.value)}>
                                {createOwnDraft.systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </label>
                            <label>IF SOURCE IS LOST
                              <select value={dep.failure_effect}
                                onChange={(e) => updateDraftDependency(index,"failure_effect",e.target.value)}>
                                <option value="failed">TARGET FAILS</option>
                                <option value="degraded">TARGET DEGRADES</option>
                              </select>
                            </label>
                            <label>DELAY · MIN
                              <input type="number" min="0" value={dep.delay_minutes ?? 0}
                                onChange={(e) => updateDraftDependency(index,"delay_minutes",e.target.value)} />
                            </label>
                            <label>REDUNDANCY GROUP
                              <input value={dep.requirement_group ?? ""} placeholder="Optional"
                                onChange={(e) => updateDraftDependency(index,"requirement_group",e.target.value)} />
                            </label>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="create-own-actions">
                  <button className="secondary-button" type="button"
                    onClick={() => { setCreateOwnStage("inventory"); setCreateOwnDraft(null); }}>
                    BACK TO INVENTORY
                  </button>
                  <button className="break-button" disabled={createOwnLoading}
                    onClick={approveOwnModel}>
                    {createOwnLoading ? "VALIDATING..." : "APPROVE + BUILD MODEL"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      </main>





      {panel && (



        <div

          className="builder-overlay"



          onMouseDown={(event) => {

            if (

              event.target ===

              event.currentTarget

            ) {

              setPanel(null);

            }

          }}

        >



          <aside className="builder-panel">



            <div className="builder-panel-head">



              <div>



                <span>

                  FRACTRA / MODEL

                  BUILDER

                </span>



                <h2>



                  {panel ===

                    "organization" &&

                    "New organization"}



                  {panel ===

                    "system" &&

                    "Add system"}



                  {panel ===

                    "dependency" &&

                    "Connect systems"}

                  {panel === "choose-system" &&
                    "Choose system to fix"}

                  {panel === "edit-system" &&
                    "Implement fix"}



                </h2>



              </div>





              <button

                onClick={() =>

                  setPanel(null)

                }

              >

                <X size={18} />

              </button>



            </div>





            {panel ===

              "organization" && (



              <form

                className="builder-form"



                onSubmit={

                  createOrganization

                }

              >



                <label>



                  ORGANIZATION NAME



                  <input

                    required



                    placeholder="e.g. Northstar Logistics"



                    value={

                      organizationForm

                        .name

                    }



                    onChange={(

                      event

                    ) =>

                      setOrganizationForm(

                        {

                          ...organizationForm,



                          name:

                            event.target

                              .value,

                        }

                      )

                    }

                  />



                </label>





                <label>



                  ORGANIZATION TYPE



                  <input

                    required



                    placeholder="e.g. logistics"



                    value={

                      organizationForm

                        .type

                    }



                    onChange={(

                      event

                    ) =>

                      setOrganizationForm(

                        {

                          ...organizationForm,



                          type:

                            event.target

                              .value,

                        }

                      )

                    }

                  />



                </label>





                <button

                  className="builder-submit"

                  type="submit"

                >

                  CREATE MODEL



                  <ArrowRight

                    size={16}

                  />

                </button>



              </form>

            )}





            {panel === "system" && (



              <form

                className="builder-form"



                onSubmit={

                  addSystem

                }

              >



                <label>



                  SYSTEM NAME



                  <input

                    required



                    placeholder="e.g. Backup Generator"



                    value={

                      systemForm.name

                    }



                    onChange={(

                      event

                    ) =>

                      setSystemForm({

                        ...systemForm,



                        name:

                          event.target

                            .value,

                      })

                    }

                  />



                </label>





                <label>



                  CATEGORY



                  <input

                    required



                    placeholder="e.g. infrastructure"



                    value={

                      systemForm

                        .category

                    }



                    onChange={(

                      event

                    ) =>

                      setSystemForm({

                        ...systemForm,



                        category:

                          event.target

                            .value,

                      })

                    }

                  />



                </label>





                <label>



                  CRITICALITY



                  <select

                    value={

                      systemForm

                        .criticality

                    }



                    onChange={(

                      event

                    ) =>

                      setSystemForm({

                        ...systemForm,



                        criticality:

                          Number(

                            event.target

                              .value

                          ),

                      })

                    }

                  >



                    <option value={1}>

                      1 — Low

                    </option>



                    <option value={2}>

                      2 — Moderate

                    </option>



                    <option value={3}>

                      3 — Important

                    </option>



                    <option value={4}>

                      4 — High

                    </option>



                    <option value={5}>

                      5 — Critical

                    </option>



                  </select>



                </label>





                <label className="builder-check">



                  <input

                    type="checkbox"



                    checked={

                      systemForm

                        .standby

                    }



                    onChange={(

                      event

                    ) =>

                      setSystemForm({

                        ...systemForm,



                        standby:

                          event.target

                            .checked,

                      })

                    }

                  />



                  <span>



                    <strong>

                      STANDBY SYSTEM

                    </strong>



                    <small>

                      Activate this system

                      only when another

                      provider becomes

                      unavailable.

                    </small>



                  </span>



                </label>





                {systemForm.standby && (



                  <label>



                    MAXIMUM RUNTIME

                    (MINUTES)



                    <input

                      type="number"

                      min="1"



                      placeholder="e.g. 120"



                      value={

                        systemForm

                          .max_runtime_minutes

                      }



                      onChange={(

                        event

                      ) =>

                        setSystemForm({

                          ...systemForm,



                          max_runtime_minutes:

                            event.target

                              .value ===

                            ""

                              ? ""

                              : Number(

                                  event

                                    .target

                                    .value

                                ),

                        })

                      }

                    />



                    <small className="field-help">

                      Optional. Leave

                      empty if the backup

                      can operate

                      indefinitely.

                    </small>



                  </label>



                )}





                <button

                  className="builder-submit"

                  type="submit"

                >

                  ADD SYSTEM



                  <ArrowRight

                    size={16}

                  />

                </button>



              </form>



            )}





            {panel === "choose-system" && (
              <div className="builder-form">
                <div className="dependency-explainer">
                  <Activity size={17} />
                  <p>
                    Choose the system you want to strengthen.
                    FRACTRA will save the mitigation to the real
                    organization model.
                  </p>
                </div>

                {model?.systems.map((system) => (
                  <button
                    key={system.id}
                    type="button"
                    className="builder-submit"
                    onClick={() => openSystemEditor(system)}
                  >
                    {system.name.toUpperCase()}
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            )}


            {panel === "edit-system" && (
              <form
                className="builder-form"
                onSubmit={updateSystem}
              >
                <div className="dependency-explainer">
                  <Activity size={17} />
                  <p>
                    This changes the actual model. Replay uses
                    the same initiating failure against the
                    updated configuration.
                  </p>
                </div>

                {selectedMitigation && (
                  <div style={impactStyle}>
                    <span>APERTUS HYPOTHESIS / REVIEW BEFORE SAVING</span>
                    <strong
                      style={{
                        display: "block",
                        marginTop: "6px",
                        marginBottom: "6px",
                      }}
                    >
                      {selectedMitigation.title}
                    </strong>
                    <p>{selectedMitigation.reason}</p>
                    <small>
                      FRACTRA PROPOSED TEST:{" "}
                      {selectedMitigation.original_runtime !== null &&
                      selectedMitigation.proposed_runtime !== ""
                        ? `${selectedMitigation.target_system_id}.max_runtime_minutes ${selectedMitigation.original_runtime} → ${selectedMitigation.proposed_runtime}`
                        : selectedMitigation.test}
                    </small>
                    <small
                      style={{
                        display: "block",
                        marginTop: "8px",
                        opacity: 0.7,
                      }}
                    >
                      Review or change the value below. Nothing is applied
                      until you choose SAVE MITIGATION.
                    </small>
                  </div>
                )}

                <label>
                  SYSTEM NAME
                  <input
                    required
                    value={editSystemForm.name}
                    onChange={(event) =>
                      setEditSystemForm({
                        ...editSystemForm,
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  CATEGORY
                  <input
                    required
                    value={editSystemForm.category}
                    onChange={(event) =>
                      setEditSystemForm({
                        ...editSystemForm,
                        category: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  CRITICALITY
                  <select
                    value={editSystemForm.criticality}
                    onChange={(event) =>
                      setEditSystemForm({
                        ...editSystemForm,
                        criticality: Number(event.target.value),
                      })
                    }
                  >
                    <option value={1}>1 — Low</option>
                    <option value={2}>2 — Moderate</option>
                    <option value={3}>3 — Important</option>
                    <option value={4}>4 — High</option>
                    <option value={5}>5 — Critical</option>
                  </select>
                </label>

                <label className="builder-check">
                  <input
                    type="checkbox"
                    checked={editSystemForm.standby}
                    onChange={(event) =>
                      setEditSystemForm({
                        ...editSystemForm,
                        standby: event.target.checked,
                        max_runtime_minutes:
                          event.target.checked
                            ? editSystemForm.max_runtime_minutes
                            : "",
                      })
                    }
                  />
                  <span>
                    <strong>STANDBY SYSTEM</strong>
                    <small>
                      Activate only when another provider
                      becomes unavailable.
                    </small>
                  </span>
                </label>

                {editSystemForm.standby && (
                  <label>
                    MAXIMUM RUNTIME (MINUTES)
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 120"
                      value={editSystemForm.max_runtime_minutes}
                      onChange={(event) =>
                        setEditSystemForm({
                          ...editSystemForm,
                          max_runtime_minutes:
                            event.target.value === ""
                              ? ""
                              : Number(event.target.value),
                        })
                      }
                    />
                    <small className="field-help">
                      Leave empty if the backup can operate
                      indefinitely.
                    </small>
                  </label>
                )}

                <button
                  className="builder-submit"
                  type="submit"
                >
                  SAVE MITIGATION
                  <ArrowRight size={16} />
                </button>
              </form>
            )}


            {panel ===

              "dependency" && (



              <form

                className="builder-form"



                onSubmit={

                  addDependency

                }

              >



                <div className="dependency-explainer">



                  <Activity

                    size={17}

                  />



                  <p>

                    If{" "}

                    <strong>

                      Source

                    </strong>{" "}

                    fails, FRACTRA applies

                    the selected effect to{" "}

                    <strong>

                      Target

                    </strong>

                    .

                  </p>



                </div>





                <label>



                  SOURCE SYSTEM



                  <select

                    required



                    value={

                      dependencyForm

                        .source

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          source:

                            event.target

                              .value,

                        }

                      )

                    }

                  >



                    <option value="">

                      Select source

                    </option>



                    {model.systems.map(

                      (system) => (



                        <option

                          key={

                            system.id

                          }



                          value={

                            system.id

                          }

                        >

                          {

                            system.name

                          }

                        </option>



                      )

                    )}



                  </select>



                </label>





                <label>



                  TARGET SYSTEM



                  <select

                    required



                    value={

                      dependencyForm

                        .target

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          target:

                            event.target

                              .value,

                        }

                      )

                    }

                  >



                    <option value="">

                      Select target

                    </option>



                    {model.systems.map(

                      (system) => (



                        <option

                          key={

                            system.id

                          }



                          value={

                            system.id

                          }

                        >

                          {

                            system.name

                          }

                        </option>



                      )

                    )}



                  </select>



                </label>





                <label>



                  DEPENDENCY TYPE



                  <select

                    value={

                      dependencyForm

                        .type

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          type:

                            event.target

                              .value,

                        }

                      )

                    }

                  >



                    <option value="service">

                      Service

                    </option>



                    <option value="power">

                      Power

                    </option>



                    <option value="network">

                      Network

                    </option>



                    <option value="data">

                      Data

                    </option>



                    <option value="identity">

                      Identity

                    </option>



                    <option value="supply">

                      Supply

                    </option>



                    <option value="people">

                      People

                    </option>



                  </select>



                </label>





                <label>



                  IF SOURCE FAILS



                  <select

                    value={

                      dependencyForm

                        .failure_effect

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          failure_effect:

                            event.target

                              .value,

                        }

                      )

                    }

                  >



                    <option value="failed">

                      Target fails

                    </option>



                    <option value="degraded">

                      Target degrades

                    </option>



                  </select>



                </label>





                <label>



                  FAILURE DELAY

                  (MINUTES)



                  <input

                    type="number"

                    min="0"



                    value={

                      dependencyForm

                        .delay_minutes

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          delay_minutes:

                            Math.max(

                              0,

                              Number(

                                event

                                  .target

                                  .value

                              )

                            ),

                        }

                      )

                    }

                  />



                  <small className="field-help">

                    How long after the

                    source fails before

                    the effect reaches

                    the target.

                  </small>



                </label>





                <label>



                  REDUNDANCY GROUP



                  <input

                    type="text"



                    placeholder="e.g. network-power"



                    value={

                      dependencyForm

                        .requirement_group

                    }



                    onChange={(

                      event

                    ) =>

                      setDependencyForm(

                        {

                          ...dependencyForm,



                          requirement_group:

                            event.target

                              .value,

                        }

                      )

                    }

                  />



                  <small className="field-help">

                    Optional. Alternative

                    providers for the same

                    target should use the

                    same group name.

                  </small>



                </label>





                <div className="dependency-note">



                  <Activity

                    size={16}

                  />



                  <p>

                    Dependencies with the

                    same target and

                    redundancy group are

                    treated as alternative

                    providers. FRACTRA

                    propagates the failure

                    only when no provider

                    remains available.

                  </p>



                </div>





                <button

                  className="builder-submit"

                  type="submit"

                >

                  SAVE DEPENDENCY



                  <ArrowRight

                    size={16}

                  />

                </button>



              </form>



            )}



          </aside>



        </div>



      )}





      {activePhase === "after" && (
        <section className="reality-diff">
          <div className="diff-head">
            <div>
              <span className="index">AFTER / REALITY DIFF</span>
              <h2>Prediction meets reality.</h2>
              {liveIncident?.status === "ended" && (
                <p>
                  <strong>{liveIncident.name}</strong> is frozen. FRACTRA is comparing
                  what the incident-start model predicted with what people actually confirmed during the incident.
                </p>
              )}
            </div>
            {liveIncident?.reality_diff?.status === "ready" && (
              <div>
                <small>OBSERVED WINDOW</small>
                <strong style={{ display: "block" }}>
                  {Number(liveIncident.reality_diff.observed_window_minutes || 0).toFixed(1)} MIN
                </strong>
              </div>
            )}
          </div>

          {!liveIncident || liveIncident.status !== "ended" ? (
            <p>End a live incident in DURING to unlock its Reality Diff.</p>
          ) : liveIncident.reality_diff?.status === "insufficient_evidence" ? (
            <div className="model-gap">
              {liveIncident.reality_diff.note}
            </div>
          ) : liveIncident.reality_diff?.status === "ready" ? (
            <>
              <div className="diff-storyline" aria-label="Reality Diff learning flow">
                <div className="diff-story-step">
                  <small>01 · PREDICTED</small>
                  <strong>What the model expected</strong>
                </div>
                <div className="diff-story-arrow">→</div>
                <div className="diff-story-step">
                  <small>02 · OBSERVED</small>
                  <strong>What people confirmed</strong>
                </div>
                <div className="diff-story-arrow">→</div>
                <div className="diff-story-step">
                  <small>03 · LEARN</small>
                  <strong>Correct the model, then replay</strong>
                </div>
              </div>

              {(() => {
                const summary = liveIncident.reality_diff.summary || {};
                return (
                  <div className="diff-summary">
                    <div className="diff-stat"><strong>{summary.matched || 0}</strong><small>MATCHED</small></div>
                    <div className="diff-stat"><strong>{summary.timing_mismatch || 0}</strong><small>TIMING / STATE MISMATCH</small></div>
                    <div className="diff-stat"><strong>{summary.unexpected_observed || 0}</strong><small>UNEXPECTED OBSERVED</small></div>
                    <div className="diff-stat"><strong>{summary.predicted_not_observed || 0}</strong><small>PREDICTED NOT OBSERVED</small></div>
                  </div>
                );
              })()}

              <div className="diff-method">
                REALITY DIFF is deterministic. EXPECTED comes from the immutable model captured
                when the incident began. OBSERVED comes only from human-confirmed incident records.
                Apertus explains discrepancies and proposes hypotheses; it does not invent the facts.
                “Predicted not observed” means the predicted impact was not human-confirmed inside the recorded observation window; it is not proof that the impact never occurred.
              </div>

              {(liveIncident.reality_diff.items || []).length === 0 ? (
                <p>No comparable failed/degraded observations were recorded beyond the trigger.</p>
              ) : (
                (liveIncident.reality_diff.items || []).map((item, index) => (
                  <article className={`diff-item ${item.type === "matched" ? "matched" : "gap"}`} key={`${item.system_id}-${item.type}-${index}`}>
                    <div className="diff-item-head">
                      <strong>{item.system_name}</strong>
                      <span className="diff-badge">
                        {item.type === "matched"
                          ? "MATCHED"
                          : item.type === "timing_mismatch"
                          ? "TIMING / STATE MISMATCH"
                          : item.type === "unexpected_observed"
                          ? "UNEXPECTED OBSERVED"
                          : "PREDICTED NOT OBSERVED"}
                      </span>
                    </div>

                    <div className="diff-columns">
                      <div className="diff-column">
                        <small>PREDICTED · IMMUTABLE BASELINE</small>
                        {item.expected ? (
                          <>
                            <strong>{String(item.expected.status).toUpperCase()}</strong>
                            <div>T+{Number(item.expected.time_minutes || 0).toFixed(1)} min</div>
                          </>
                        ) : (
                          <strong>NO IMPACT PREDICTED</strong>
                        )}
                      </div>

                      <div className="diff-column">
                        <small>OBSERVED · HUMAN CONFIRMED</small>
                        {item.observed ? (
                          <>
                            <strong>{String(item.observed.state).toUpperCase()}</strong>
                            <div>T+{Number(item.observed.time_minutes || 0).toFixed(1)} min</div>
                          </>
                        ) : (
                          <strong>NOT CONFIRMED IN OBSERVED WINDOW</strong>
                        )}
                      </div>
                    </div>

                    {typeof item.delta_minutes === "number" && (
                      <p>
                        Reality was{" "}
                        <strong>
                          {item.delta_minutes === 0
                            ? "on the modeled timing"
                            : item.delta_minutes < 0
                            ? `${Math.abs(item.delta_minutes).toFixed(1)} min earlier`
                            : `${item.delta_minutes.toFixed(1)} min later`}
                        </strong>.
                      </p>
                    )}

                    {item.model_gap && (
                      <div className="model-gap">
                        <strong>MODEL GAP / REVIEW</strong><br />
                        {item.model_gap}
                      </div>
                    )}

                    {item.type !== "matched" && !liveIncident.approved_model_branch && (
                      <div className="gap-review">
                        {!liveIncident.gap_reviews?.[String(index)] ? (
                          <button
                            type="button"
                            onClick={() => analyseGap(index)}
                            disabled={gapLoading === `analyse-${index}`}
                          >
                            {gapLoading === `analyse-${index}`
                              ? "APERTUS REVIEWING..."
                              : "REVIEW GAP WITH APERTUS →"}
                          </button>
                        ) : (
                          <>
                            <h4>APERTUS GAP REVIEW · HYPOTHESES, NOT FACTS</h4>
                            <p>{liveIncident.gap_reviews[String(index)].analysis?.explanation}</p>

                            {(liveIncident.gap_reviews[String(index)].analysis?.hypotheses || []).map(
                              (hypothesis, hypothesisIndex) => (
                                <div className="gap-hypothesis" key={hypothesisIndex}>
                                  <strong>{hypothesis.title}</strong><br />
                                  {hypothesis.reason}
                                </div>
                              )
                            )}

                            {(liveIncident.gap_reviews[String(index)].analysis?.proposed_changes || []).map(
                              (proposal) => {
                                const decision = (
                                  liveIncident.gap_reviews[String(index)].decisions || []
                                ).find((entry) => entry.proposal_id === proposal.id);

                                return (
                                  <div className="proposal" key={proposal.id}>
                                    <strong>{proposal.title}</strong>
                                    <p>{proposal.reason}</p>
                                    <small>EDITABLE STRUCTURED MODEL CHANGE</small>
                                    <textarea
                                      value={proposalDraft(index, proposal)}
                                      onChange={(event) =>
                                        updateProposalDraft(index, proposal, event.target.value)
                                      }
                                      disabled={Boolean(decision)}
                                    />
                                    {!decision ? (
                                      <div className="proposal-actions">
                                        <button
                                          type="button"
                                          onClick={() => decideGap(index, proposal, "accepted")}
                                          disabled={Boolean(gapLoading)}
                                        >
                                          ACCEPT / SAVE CHANGE
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => decideGap(index, proposal, "rejected")}
                                          disabled={Boolean(gapLoading)}
                                        >
                                          REJECT
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="decision">
                                        HUMAN DECISION · {decision.decision.toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}

              <div className="learning-gate">
                <strong>LEARNING GATE · HUMAN APPROVAL REQUIRED</strong><br />
                Only accepted structured changes can enter a new model version. The original incident and baseline remain unchanged.
              </div>

              <div className="branch-box">
                <span className="index">CALIBRATE / MODEL VERSIONING</span>
                {liveIncident.approved_model_branch ? (
                  <>
                    <h3>The model has learned from this incident.</h3>
                    <p>
                      Original incident-start model remains unchanged. New version:{" "}
                      <strong>{liveIncident.approved_model_branch.id}</strong>
                    </p>
                    <button type="button" onClick={() => setActivePhase("recover")}>
                      CONTINUE TO RECOVER / COUNTERFACTUAL REPLAY →
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Turn reviewed evidence into a better model.</h3>
                    <p>
                      FRACTRA applies only human-accepted structured changes to a new branch.
                      This improves model fit; it does not claim the organisation is safer yet.
                    </p>
                    <button
                      type="button"
                      onClick={createRealityBranch}
                      disabled={branchLoading}
                    >
                      {branchLoading ? "CREATING BRANCH..." : "CREATE REALITY-CALIBRATED BRANCH →"}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p>This older incident has no Reality Diff yet. Start and end a new incident with the updated backend.</p>
          )}
        </section>
      )}

      {activePhase === "recover" && (
        <section className="recover-workspace">
          <span className="index">RECOVER / COUNTERFACTUAL TWIN</span>
          <h2>Learn what was wrong. Then prove the fix changes the outcome.</h2>
          <p className="recover-lead">
            FRACTRA replays the same confirmed initiating disruption against the
            immutable incident-start model and your human-approved reality-calibrated
            branch. Once the model fits reality, mitigation tests ask a separate question:
            can the organisation survive the same disruption better next time?
          </p>

          <div className="recover-storyline" aria-label="FRACTRA recovery workflow">
            <div className="recover-story-step"><small>01 · RECONSTRUCT</small><strong>Replay the incident</strong></div>
            <span className="recover-story-arrow">→</span>
            <div className="recover-story-step"><small>02 · CALIBRATE</small><strong>Make the model truthful</strong></div>
            <span className="recover-story-arrow">→</span>
            <div className="recover-story-step"><small>03 · FIX</small><strong>Test a mitigation</strong></div>
            <span className="recover-story-arrow">→</span>
            <div className="recover-story-step"><small>04 · REPLAY</small><strong>Measure improvement</strong></div>
          </div>

          {!liveIncident?.approved_model_branch ? (
            <div className="recover-basis">
              Create a reality-calibrated branch in AFTER before running a counterfactual replay.
            </div>
          ) : (
            <>
              <div className="recover-basis">
                <strong>REPLAY BASIS</strong><br />
                Incident: {liveIncident.name}<br />
                Improved model: {liveIncident.approved_model_branch.id}
              </div>

              <div className="recover-action">
                <button
                  type="button"
                  onClick={runCounterfactualReplay}
                  disabled={counterfactualLoading}
                >
                  {counterfactualLoading
                    ? "RUNNING DETERMINISTIC REPLAY..."
                    : counterfactual
                      ? "REPLAY SAME DISRUPTION AGAIN →"
                      : "REPLAY THIS INCIDENT →"}
                </button>
              </div>
            </>
          )}

          {counterfactual && (
            <>
              <div className="recover-grid">
                <div className="recover-card">
                  <small>WHAT WE EXPECTED · ORIGINAL MODEL</small>
                  <strong>{counterfactual.baseline?.resilience_score ?? "—"}</strong>
                  <p>
                    Failed: {counterfactual.baseline?.metrics?.failed_systems ?? 0} ·
                    Degraded: {counterfactual.baseline?.metrics?.degraded_systems ?? 0}
                  </p>
                </div>
                <div className="recover-card">
                  <small>WHAT ACTUALLY HAPPENED · RECORDED</small>
                  <strong>{counterfactual.actual_observations?.length ?? 0}</strong>
                  <p>Confirmed failed/degraded observations in the frozen incident.</p>
                </div>
                <div className="recover-card">
                  <small>WHAT IF · REALITY-CALIBRATED BRANCH</small>
                  <strong>{counterfactual.counterfactual?.resilience_score ?? "—"}</strong>
                  <p>
                    Score change: {counterfactual.comparison?.resilience_score_change > 0 ? "+" : ""}
                    {counterfactual.comparison?.resilience_score_change ?? 0}
                  </p>
                </div>
              </div>

              {counterfactual.calibration && (
                <div className={`calibration-verdict ${counterfactual.calibration.verdict}`}>
                  <small>REALITY CALIBRATION CHECK</small>
                  <h3>
                    {counterfactual.calibration.verdict === "sufficient"
                      ? "CALIBRATION SUFFICIENT"
                      : "CALIBRATION INSUFFICIENT"}
                  </h3>
                  <p>
                    {counterfactual.calibration.verdict === "sufficient"
                      ? `The calibrated branch reproduces every confirmed failed/degraded observation within ${counterfactual.calibration.tolerance_minutes} minute and with the same state.`
                      : `The calibrated branch still does not reproduce all confirmed incident observations within ${counterfactual.calibration.tolerance_minutes} minute and with the same state.`}
                  </p>

                  <div className="calibration-error-list">
                    {counterfactual.calibration.items?.map((item) => (
                      <div className="calibration-error-row" key={item.system_id}>
                        <strong>{item.system_name}</strong>
                        <span>Recorded T+{item.observed_recorded_time_minutes}</span>
                        <span>
                          Remaining error: {item.counterfactual_time_error_minutes == null
                            ? "not reproduced"
                            : `${item.counterfactual_time_error_minutes} min`}
                        </span>
                        <span>
                          Error reduced: {item.error_reduction_minutes == null
                            ? "—"
                            : `${item.error_reduction_minutes} min`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {counterfactual.calibration.verdict === "insufficient" && (
                    <div className="calibrate-again">
                      <p>
                        The current branch is still too far from recorded reality.
                        FRACTRA can construct another counterfactual model test against
                        <strong> the current branch</strong>, not the original model.
                      </p>

                      <button
                        type="button"
                        onClick={loadNextCalibrationTests}
                        disabled={calibrationLoading}
                      >
                        {calibrationLoading ? "PREPARING TEST..." : "CALIBRATE AGAIN →"}
                      </button>

                      {calibrationTests.map((test) => (
                        <div className="calibration-test" key={test.id}>
                          <small>HUMAN REVIEW REQUIRED · MODEL TEST</small>
                          <h4>{test.title}</h4>
                          <p>{test.reason}</p>
                          <pre>{JSON.stringify(test.change, null, 2)}</pre>
                          <button
                            type="button"
                            onClick={() => applyCalibrationTest(test)}
                            disabled={calibrationLoading}
                          >
                            ACCEPT → CREATE NEXT BRANCH
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCalibrationTests((items) =>
                                items.filter((item) => item.id !== test.id)
                              )
                            }
                          >
                            REJECT
                          </button>
                        </div>
                      ))}

                      {calibrationHistory.length > 0 && (
                        <div className="version-chain">
                          <strong>CALIBRATION VERSION CHAIN</strong><br />
                          {calibrationHistory.map((version) => (
                            <div key={version.model_id}>
                              v{version.version} · {version.parent_model_id} → {version.model_id}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="recover-note">{counterfactual.calibration.meaning}</p>
                </div>
              )}

              {counterfactual.calibration?.verdict === "sufficient" && (
                <div className="fix-after-learning">
                  <small>03 / FIX + REPLAY · HUMAN APPROVAL</small>
                  <h3>Now improve the organisation, not just the model.</h3>
                  <p>
                    Calibration made the model better match recorded reality. That is model fit,
                    not proof of safety. Now test whether a human-approved change measurably reduces
                    modeled damage or buys response time under the same initiating disruption.
                  </p>

                  <button
                    type="button"
                    onClick={loadMitigationTests}
                    disabled={mitigationLoading}
                  >
                    {mitigationLoading ? "PREPARING TESTS..." : "FIND MITIGATION TESTS →"}
                  </button>

                  {mitigationTests.map((test) => (
                    <div className="mitigation-card" key={test.id}>
                      <small>COUNTERFACTUAL MITIGATION · HUMAN REVIEW</small>
                      <h4>{test.title}</h4>
                      <p>{test.reason}</p>
                      <pre>{JSON.stringify(test.changes || test.change, null, 2)}</pre>
                      <p className="recover-note">{test.warning}</p>
                      <button type="button" onClick={() => testMitigation(test)}>
                        TEST WITH DETERMINISTIC ENGINE →
                      </button>
                    </div>
                  ))}

                  {mitigationResult && (
                    <div className="mitigation-result">
                      <strong>
                        {mitigationResult.verdict === "outcome_improved"
                          ? "OUTCOME IMPROVED"
                          : mitigationResult.verdict === "response_window_improved"
                            ? `RESPONSE WINDOW IMPROVED · +${mitigationResult.response_window?.max_minutes_bought ?? 0} MIN`
                            : "NO MEASURED IMPROVEMENT"}
                      </strong>
                      <p>
                        Resilience score: {mitigationResult.before?.resilience_score ?? "—"}
                        {" → "}
                        {mitigationResult.after?.resilience_score ?? "—"}
                        {" · "}
                        Failed systems change: {mitigationResult.comparison?.failed_systems_change ?? 0}
                        {" · "}
                        Degraded systems change: {mitigationResult.comparison?.degraded_systems_change ?? 0}
                      </p>

                      {(mitigationResult.response_window?.systems || []).map((row) => (
                        <p key={row.system_id}>
                          <strong>{row.system_id}</strong>
                          {" · T+"}{row.before_minutes}
                          {" → T+"}{row.after_minutes}
                          {" · +"}{row.minutes_bought}{" min response window"}
                        </p>
                      ))}

                      <p className="recover-note">{mitigationResult.meaning}</p>
                      {["outcome_improved", "response_window_improved"].includes(mitigationResult.verdict) && (
                        <button type="button" onClick={promoteMitigation}>
                          HUMAN APPROVE → CREATE RESILIENCE BRANCH
                        </button>
                      )}
                    </div>
                  )}

                  {liveIncident?.improved_resilience_branch && (
                    <div className="version-chain">
                      <strong>04 / LEARNED RESILIENCE BRANCH CREATED</strong><br />
                      {liveIncident.improved_resilience_branch.parent_model_id}
                      {" → "}
                      {liveIncident.improved_resilience_branch.model_id}
                    </div>
                  )}
                </div>
              )}

              <div className="recover-table">
                <div className="recover-row header">
                  <span>SYSTEM</span>
                  <span>ORIGINAL MODEL</span>
                  <span>RECORDED REALITY</span>
                  <span>COUNTERFACTUAL</span>
                </div>
                {counterfactual.systems?.map((item) => {
                  const actual = counterfactual.actual_observations?.find(
                    (obs) => obs.system_id === item.system_id
                  );
                  return (
                    <div className="recover-row" key={item.system_id}>
                      <strong>{item.system_name}</strong>
                      <span>
                        {item.baseline
                          ? `${item.baseline.status.toUpperCase()} · T+${item.baseline.time_minutes}`
                          : "NO IMPACT"}
                      </span>
                      <span>
                        {actual
                          ? `${actual.state.toUpperCase()} · RECORDED T+${actual.recorded_time_minutes}`
                          : "NOT CONFIRMED"}
                      </span>
                      <span>
                        {item.counterfactual
                          ? `${item.counterfactual.status.toUpperCase()} · T+${item.counterfactual.time_minutes}`
                          : "PREVENTED IN MODEL"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="recover-note">
                {counterfactual.interpretation} “Recorded reality” reflects the time
                the human observation was entered, not independently verified physical onset.
              </p>
            </>
          )}
        </section>
      )}

      {activePhase === "before" && simulation && (



        <section

          className={`timeline ${

            timelineOpen

              ? "open"

              : ""

          }`}

        >



          <button

            className="timeline-toggle"



            onClick={() =>

              setTimelineOpen(

                !timelineOpen

              )

            }

          >



            <div>



              <span>

                ACTIVE STRESS TEST

              </span>



              <strong>

                {simulation.systems

                  .find(

                    (system) =>

                      system.id ===

                      selectedSystem

                  )

                  ?.name?.toUpperCase() ||

                  "SYSTEM"}{" "}

                FAILURE

              </strong>



            </div>





            <ChevronUp

              size={20}



              className={

                timelineOpen

                  ? ""

                  : "rotated"

              }

            />



          </button>





          {timelineOpen && (



            <div className="timeline-content">



              <div className="event-list">



                {simulation.events.map(

                  (event, index) => {



                    const system =

                      simulation.systems.find(

                        (item) =>

                          item.id ===

                          event.system

                      );



                    const source =

                      simulation.systems.find(

                        (item) =>

                          item.id ===

                          event.caused_by

                      );



                    const eventClass =

                      event.status ===

                      "failed"

                        ? "failed-event"

                        : event.status ===

                          "activated"

                        ? "activated-event"

                        : "warning-event";



                    return (



                      <div

                        className={`event ${eventClass}`}



                        key={

                          `${event.system}-` +

                          `${event.time_minutes}-` +

                          `${index}`

                        }

                      >



                        <time>

                          T+

                          {String(

                            event.time_minutes

                          ).padStart(

                            2,

                            "0"

                          )}

                        </time>

                        <span />

                        <p>

                          <strong>

                            {system?.name?.toUpperCase()}{" "}

                            <span

                              className={`event-status ${event.status}`}

                            >
                              {event.status ===

                              "activated"

                                ? "ACTIVE BACKUP"

                                : event.status.toUpperCase()}

                            </span>



                          </strong>





                          {event.reason ||

                            `${source?.name ||

                              "Dependency"} caused this through ${

                              event.dependency_type ||

                              "a dependency"

                            }.`}



                        </p>



                      </div>



                    );

                  }

                )}



              </div>





              <div className="simulation-result">



                <span>

                  RESILIENCE AFTER

                  DISRUPTION

                </span>





                <div className="result-score">



                  <strong>

                    {

                      simulation.resilience_score

                    }

                  </strong>



                  <small>

                    /100

                  </small>



                </div>





                <p>



                  {

                    simulation.systems.filter(

                      (system) =>

                        system.status ===

                        "failed"

                    ).length

                  }{" "}

                  failed /{" "}



                  {

                    simulation.systems.filter(

                      (system) =>

                        system.status ===

                        "degraded"

                    ).length

                  }{" "}

                  degraded /{" "}



                  {

                    simulation.systems.filter(

                      (system) =>

                        system.status ===

                        "stable"

                    ).length

                  }{" "}

                  stable.



                </p>





                {simulation.metrics && (



                  <div className="simulation-metrics" style={resultGridStyle}>
                    <span style={resultCardStyle}>
                      CASCADE DURATION
                      <strong>
                        {simulation.metrics.cascade_duration_minutes} MIN
                      </strong>
                    </span>

                    <span style={resultCardStyle}>
                      CASCADE EVENTS
                      <strong>{simulation.metrics.cascade_events}</strong>
                    </span>
                  </div>



                )}





                {baselineSimulation && (
                  <div className="replay-workbench">
                    {!replaySimulation ? (
                      <>
                        <span>05 / FIX + REPLAY</span>
                        <p>
                          Change the real model, then replay the
                          exact same initiating failure.
                        </p>
                        <div className="result-actions">
                          <button
                            onClick={() => {
                              if (model.systems.length === 1) {
                                openSystemEditor(model.systems[0]);
                              } else {
                                setPanel("choose-system");
                              }
                            }}
                          >
                            IMPLEMENT FIX →
                          </button>

                          <button
                            onClick={replaySameFailure}
                            disabled={simulating}
                          >
                            <RotateCcw size={14} />
                            {simulating
                              ? "REPLAYING..."
                              : "REPLAY SAME FAILURE"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="comparison-result">
                        <span>BEFORE / AFTER</span>

                        <div className="comparison-grid" style={comparisonGridStyle}>
                          <span></span>
                          <strong>BEFORE</strong>
                          <strong>AFTER</strong>

                          <span>RESILIENCE</span>
                          <strong>{baselineSimulation.resilience_score}/100</strong>
                          <strong>{replaySimulation.resilience_score}/100</strong>

                          <span>FAILED</span>
                          <strong>{baselineSimulation.metrics?.failed_systems ?? 0}</strong>
                          <strong>{replaySimulation.metrics?.failed_systems ?? 0}</strong>

                          <span>DEGRADED</span>
                          <strong>{baselineSimulation.metrics?.degraded_systems ?? 0}</strong>
                          <strong>{replaySimulation.metrics?.degraded_systems ?? 0}</strong>

                          <span>DURATION</span>
                          <strong>{baselineSimulation.metrics?.cascade_duration_minutes ?? 0} MIN</strong>
                          <strong>{replaySimulation.metrics?.cascade_duration_minutes ?? 0} MIN</strong>

                          <span>EVENTS</span>
                          <strong>{baselineSimulation.metrics?.cascade_events ?? 0}</strong>
                          <strong>{replaySimulation.metrics?.cascade_events ?? 0}</strong>
                        </div>

                        <div style={impactStyle}>
                          <span>MITIGATION IMPACT</span>
                          <strong
                            style={{
                              display: "block",
                              marginTop: "6px",
                              marginBottom: "8px",
                            }}
                          >
                            {(() => {
                              const before =
                                baselineSimulation.metrics?.cascade_duration_minutes ?? 0;
                              const after =
                                replaySimulation.metrics?.cascade_duration_minutes ?? 0;
                              const delta = after - before;
                              return delta > 0
                                ? `+${delta} MINUTES OF OPERATIONAL SURVIVAL`
                                : delta < 0
                                ? `${Math.abs(delta)} MINUTES LESS SURVIVAL TIME`
                                : "NO SURVIVAL-TIME CHANGE";
                            })()}
                          </strong>
                          <p>
                          {(() => {
                            const before =
                              baselineSimulation.metrics
                                ?.cascade_duration_minutes ?? 0;
                            const after =
                              replaySimulation.metrics
                                ?.cascade_duration_minutes ?? 0;
                            const delta = after - before;
                            const scoreDelta =
                              replaySimulation.resilience_score -
                              baselineSimulation.resilience_score;

                            if (scoreDelta > 0 && delta > 0) {
                              return `Resilience improved by ${scoreDelta} points and the cascade was delayed by ${delta} minutes.`;
                            }

                            if (scoreDelta > 0) {
                              return `Final resilience improved by ${scoreDelta} points.`;
                            }

                            if (scoreDelta === 0 && delta > 0) {
                              return `Final resilience is unchanged, but the mitigation gained ${delta} minutes before the cascade completed.`;
                            }

                            if (scoreDelta === 0 && delta === 0) {
                              return "This mitigation produced no measurable change under the same disruption.";
                            }

                            return "The replay produced a worse outcome under the same disruption. Review the mitigation before adopting it.";
                          })()}
                        </p>
                        </div>

                        <div className="result-actions">
                          <button
                            onClick={() => {
                              if (model.systems.length === 1) {
                                openSystemEditor(model.systems[0]);
                              } else {
                                setPanel("choose-system");
                              }
                            }}
                          >
                            IMPLEMENT ANOTHER FIX →
                          </button>

                          <button
                            onClick={replaySameFailure}
                            disabled={simulating}
                          >
                            <RotateCcw size={14} />
                            REPLAY AGAIN
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}


                                {apertusError && (
                  <div style={impactStyle}>
                    <span>APERTUS ERROR</span>
                    <p>{apertusError}</p>
                    <div className="result-actions">
                      <button
                        type="button"
                        onClick={analyseWithApertus}
                        disabled={analysing}
                      >
                        <RotateCcw size={14} />
                        {analysing ? "RETRYING APERTUS..." : "RETRY APERTUS"}
                      </button>
                    </div>
                  </div>
                )}

                {apertusAnalysis?.analysis && (
                  <div style={impactStyle}>
                    <span>06 / APERTUS ANALYSIS</span>
                    <p>{apertusAnalysis.analysis.summary}</p>

                    <strong>WHY THE CASCADE HAPPENED</strong>
                    <p>{apertusAnalysis.analysis.cascade_explanation}</p>

                    {apertusAnalysis.analysis.hidden_vulnerabilities?.length > 0 && (
                      <div>
                        <strong>HIDDEN VULNERABILITIES</strong>
                        {apertusAnalysis.analysis.hidden_vulnerabilities.map((item, index) => (
                          <p key={`vulnerability-${index}`}>
                            <b>{item.title}</b><br />{item.explanation}
                          </p>
                        ))}
                      </div>
                    )}

                    {apertusAnalysis.analysis.single_points_of_failure?.length > 0 && (
                      <div>
                        <strong>SINGLE POINTS OF FAILURE</strong>
                        {apertusAnalysis.analysis.single_points_of_failure.map((item, index) => {
                          const systemName =
                            model.systems.find((system) => system.id === item.system_id)?.name ||
                            item.system_id;
                          return (
                            <p key={`spof-${index}`}>
                              <b>{systemName}</b><br />{item.reason}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {apertusAnalysis.analysis.mitigations?.length > 0 && (
                      <div>
                        <strong>MITIGATIONS TO TEST</strong>
                        {apertusAnalysis.analysis.mitigations.map((item, index) => (
                          <div
                            key={`mitigation-${index}`}
                            style={{
                              marginTop: "10px",
                              paddingTop: "10px",
                              borderTop: "1px solid rgba(255,255,255,0.12)",
                            }}
                          >
                            <b>{item.title}</b>
                            <p>{item.reason}</p>
                            <small>TEST: {item.test}</small>
                            <div className="result-actions" style={{ marginTop: "10px" }}>
                              <button
                                type="button"
                                onClick={() => openApertusMitigation(item)}
                                disabled={!item.target_system_id}
                              >
                                SELECT MITIGATION →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <small style={{ display: "block", marginTop: "14px", opacity: 0.7 }}>
                      Apertus explains the verified FRACTRA simulation.
                      Mitigations are hypotheses until tested with FIX + REPLAY.
                    </small>
                  </div>
                )}

<div className="result-actions">

                  <button
                    type="button"
                    onClick={analyseWithApertus}
                    disabled={analysing}
                  >
                    {analysing
                      ? "APERTUS IS ANALYSING..."
                      : apertusAnalysis
                      ? "ANALYSE AGAIN WITH APERTUS →"
                      : "ANALYSE WITH APERTUS →"}
                  </button>

                  <button
                    type="button"
                    className="reset"
                    onClick={resetSimulation}
                  >

                    <RotateCcw

                      size={14}

                    />

                    RESET

                  </button>

                </div>

              </div>

            </div>

          )}

        </section>

      )}

    </div>

  );

}

export default App;