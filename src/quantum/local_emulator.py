import sys
import json
import numpy as np
from pulser import Register, Sequence, Pulse
from pulser.devices import MockDevice
from pulser.waveforms import RampWaveform, BlackmanWaveform
from pulser_simulation import QutipEmulator

def run_local_simulation(coordinates):
    # Construct coordinate dictionary mapping indexes to numpy arrays
    coords_dict = {f"Node_{i}": np.array(c) for i, c in enumerate(coordinates)}
    reg = Register(coords_dict)
    
    # Declare the sequence on the MockDevice using a global Rydberg channel
    seq = Sequence(reg, MockDevice)
    seq.declare_channel("ch0", "rydberg_global")
    
    # Matches the optimized 3000 ns adiabatic pulse sweep from the cloud solver
    duration = 3000  # ns
    amp_wf = BlackmanWaveform(duration, area=np.pi * 4)
    det_wf = RampWaveform(duration, start=-10.0, stop=10.0)
    
    pulse = Pulse(amp_wf, det_wf, phase=0.0)
    seq.add(pulse, "ch0")
    
    # Initialize the local QuTiP simulator
    sim = QutipEmulator.from_sequence(seq)
    
    # Execute state evolution simulation
    result = sim.run()
    
    # Sample outcomes to build measurement counts
    counts = result.sample_final_state(N_samples=500)
    
    # Sort by frequency of occurrence
    sorted_res = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    
    # Return formatted JSON distribution representing optimal solution sets
    return [{"bitstring": b, "occurrences": c, "probability": c/500} for b, c in sorted_res[:3]]

if __name__ == "__main__":
    try:
        # Expect coordinates passed as a JSON array string argument
        input_data = json.loads(sys.argv[1])
        out = run_local_simulation(input_data)
        print(json.dumps({"status": "success", "backend": "local_emulator", "data": out}))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))