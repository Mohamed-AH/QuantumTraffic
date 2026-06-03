import os
import sys
import json
import numpy as np
from pulser import Register, Sequence, Pulse
from pulser.devices import MockDevice
from pulser.waveforms import RampWaveform, BlackmanWaveform
from pasqal_cloud import SDK
from pasqal_cloud.device import DeviceTypeName

def run_cloud(coordinates):
    # .strip() removes any hidden \r carriage returns introduced by Windows text editors
    username = os.getenv("PASQAL_USERNAME", "").strip()
    project_id = os.getenv("PASQAL_PROJECT_ID", "").strip()
    password = os.getenv("PASQAL_PASSWORD", "").strip()
    
    if not username or not project_id or not password:
        raise ValueError("Missing PASQAL_USERNAME, PASQAL_PASSWORD, or PASQAL_PROJECT_ID configuration environment values.")

    # Scale coordinates up so the physical blockade radius matches the 4.0 µm visual grid.
    # Without scaling, the low peak-Ω pulse produces ~6.5 µm blockade, causing
    # classical and quantum results to diverge on identical layouts.
    scale_factor = 1.5
    coords_dict = {f"Node_{i}": np.array(c) * scale_factor for i, c in enumerate(coordinates)}
    reg = Register(coords_dict)
    
    # Construct the pulse sequence
    seq = Sequence(reg, MockDevice)
    seq.declare_channel("ch0", "rydberg_global")
    
    # Robust Adiabatic Waveforms:
    # We use a 3000 ns pulse duration, sweep detuning widely from -10.0 to +10.0 rad/us,
    # and use an amplitude envelope with an area of 4 * \pi to prevent diabatic jumping.
    duration = 3000  # ns
    amp_wf = BlackmanWaveform(duration, area=np.pi * 4)
    det_wf = RampWaveform(duration, start=-10.0, stop=10.0)
    
    pulse = Pulse(amp_wf, det_wf, phase=0.0)
    seq.add(pulse, "ch0")
    
    # Serialize the sequence into its abstract string representation
    serialized_seq = seq.to_abstract_repr()
    
    print(f"[CLOUD] Connecting to apis.pasqal.cloud (SA Region) for Project: {project_id}...", file=sys.stderr)
    
    # Connect directly to the Saudi Arabia regional environment data cluster
    sdk = SDK(username=username, password=password, project_id=project_id, region="sa")
    
    # Define absolute run count parameters without empty variable dictionaries
    job_payload = {"runs": 500}
    
    print("[CLOUD] Dispatching batch sequence to EMU_FREE remote scheduler...", file=sys.stderr)
    batch = sdk.create_batch(
        serialized_seq, 
        [job_payload], 
        device_type=DeviceTypeName.EMU_FREE, 
        wait=True
    )
    
    # Inspect the completed jobs using updated SDK paradigms
    completed_job = batch.ordered_jobs[0]
    job_result = completed_job.result
    
    counts = {}
    
    if job_result:
        # Check 1: Try standard counter/samples structures if present
        if "counter" in job_result and job_result["counter"]:
            counts = job_result["counter"]
        elif "samples" in job_result and job_result["samples"]:
            for sample in job_result["samples"]:
                if isinstance(sample, str):
                    counts[sample] = counts.get(sample, 0) + 1
                elif isinstance(sample, dict):
                    for bitstr, occurrences in sample.items():
                        counts[bitstr] = counts.get(bitstr, 0) + occurrences
        else:
            # Check 2: Direct key parsing (Handles the active SA EMU_FREE response shape)
            for key, val in job_result.items():
                if isinstance(key, str) and all(c in '01' for c in key):
                    counts[key] = int(val)

    # Structural fallback if results are nested inside job output properties
    if not counts and hasattr(completed_job, 'output'):
        counts = getattr(completed_job, 'output', {})

    # Package data if successfully captured
    if counts:
        sorted_res = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        return [{"bitstring": b, "occurrences": c, "probability": c/500} for b, c in sorted_res[:3]]
    
    return [{"bitstring": "EMPTY_FINAL_FALLBACK", "occurrences": 0, "probability": 0.0}]

if __name__ == "__main__":
    try:
        # Parse layout array passed as an argument from Node.js
        input_data = json.loads(sys.argv[1])
        out = run_cloud(input_data)
        print(json.dumps({"status": "success", "backend": "pasqal_cloud_emu", "data": out}))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))