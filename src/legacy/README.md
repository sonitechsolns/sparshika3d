# Legacy GLB components (not mounted)

`Server.jsx`, `GPU.jsx` and `GPU_Model.jsx` render the Blender-generated
`public/server_r760.glb` / `gpu_pilot.glb` / `gpu_rtx.glb` models. They were the
original single-object viewers and are **not used by the room scene**
(`src/scene/`), which draws racks procedurally and gets live parts from the
agent's topology.

They're kept for the planned high-fidelity "open unit" view (swap the
procedural `ServerBody` for the R760 GLB when a server is pulled out). Nothing
imports them, so they don't affect the bundle.
