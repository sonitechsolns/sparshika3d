import bpy
import sys
import math

# Dimensions for A100 PCIe
# Length: 267mm, Height: 111mm, Width: 40mm (Dual slot)
LENGTH = 0.267
HEIGHT = 0.111
WIDTH = 0.040

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def create_materials():
    mats = {}
    
    # PCB
    mat = bpy.data.materials.new(name="electronic(serkit board)")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.01, 0.1, 0.02, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.8
    mats['pcb'] = mat
    
    # Heatsink (Silver/Aluminum fins)
    mat = bpy.data.materials.new(name="heatsink_metal")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.85, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.4
    mats['heatsink'] = mat
    
    # I/O Bracket
    mat = bpy.data.materials.new(name="IO shield")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.3
    mats['io'] = mat
    
    # PCIe Edge Connectors
    mat = bpy.data.materials.new(name="pcie")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.8, 0.6, 0.1, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.2
    mats['pcie'] = mat
    
    # Power Connector (Black Plastic)
    mat = bpy.data.materials.new(name="power_connector")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.6
    mats['power'] = mat

    # Branding Shroud/Cap
    mat = bpy.data.materials.new(name="shroud_body")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.8, 0.7, 0.5, 1.0) # Champagne gold
        bsdf.inputs['Metallic'].default_value = 0.5
        bsdf.inputs['Roughness'].default_value = 0.5
    mats['shroud'] = mat

    # Branding Texture
    mat_brand = bpy.data.materials.new(name="logo")
    mat_brand.use_nodes = True
    bsdf = mat_brand.node_tree.nodes.get("Principled BSDF")
    
    tex_path = "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public/branding.png"
    try:
        img = bpy.data.images.load(tex_path)
        tex_node = mat_brand.node_tree.nodes.new('ShaderNodeTexImage')
        tex_node.image = img
        mat_brand.node_tree.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
    except Exception as e:
        print("Failed to load branding texture:", e)
        bsdf.inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1.0)
    
    mats['logo'] = mat_brand
    
    return mats

def create_mesh_object(name, vertices, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj

def build_a100(mats):
    # Dimensions
    # Length (X): 0.267
    # Height (Z): 0.111
    # Width (Y): 0.040 (Dual slot)
    
    # 1. PCB (Green board at the back, Y = 0 to 0.002)
    pcb_t = 0.002
    bpy.ops.mesh.primitive_cube_add(size=1)
    pcb = bpy.context.active_object
    pcb.name = "inner board"
    pcb.scale = (LENGTH, pcb_t, HEIGHT)
    pcb.location = (0, pcb_t/2, 0)
    pcb.data.materials.append(mats['pcb'])
    
    # 2. Heatsink Base (Solid core touching PCB, Y = 0.002 to 0.012)
    hs_base_t = 0.010
    bpy.ops.mesh.primitive_cube_add(size=1)
    hs_base = bpy.context.active_object
    hs_base.name = "heatsink"
    hs_base.scale = (LENGTH * 0.98, hs_base_t, HEIGHT * 0.95)
    hs_base.location = (0, pcb_t + hs_base_t/2, 0)
    hs_base.data.materials.append(mats['heatsink'])
    
    # 3. Heatsink Fins (Array of plates, Y = 0.012 to 0.038)
    fins_t = 0.026
    num_fins = 70
    fin_thick = 0.001
    fin_gap = (LENGTH * 0.98 - (num_fins * fin_thick)) / num_fins
    
    bpy.ops.mesh.primitive_cube_add(size=1)
    fin = bpy.context.active_object
    fin.name = "heatsink_fins"
    # Fin scale: thin in X, spans Y and Z
    fin.scale = (fin_thick, fins_t, HEIGHT * 0.95)
    # Start at the left edge (X = -LENGTH/2 + ...)
    start_x = -(LENGTH * 0.98) / 2 + fin_thick/2
    fin.location = (start_x, pcb_t + hs_base_t + fins_t/2, 0)
    fin.data.materials.append(mats['heatsink'])
    
    mod = fin.modifiers.new(name="Array", type='ARRAY')
    mod.count = num_fins
    mod.use_relative_offset = False
    mod.use_constant_offset = True
    mod.constant_offset_displace = (fin_gap + fin_thick, 0, 0)
    
    bpy.context.view_layer.objects.active = fin
    bpy.ops.object.modifier_apply(modifier="Array")
    
    # 4. I/O Bracket (At X = -LENGTH/2, spanning Y and Z)
    bpy.ops.mesh.primitive_cube_add(size=1)
    io_bracket = bpy.context.active_object
    io_bracket.name = "AO shield"
    io_bracket.scale = (0.002, WIDTH, HEIGHT * 1.1)
    io_bracket.location = (-LENGTH/2 + 0.001, WIDTH/2, 0)
    io_bracket.data.materials.append(mats['io'])
    
    # 5. PCIe Edge Connector (At Z = -HEIGHT/2)
    pcie_l = LENGTH * 0.4
    pcie_h = 0.01
    bpy.ops.mesh.primitive_cube_add(size=1)
    pcie = bpy.context.active_object
    pcie.name = "pcie L2"
    pcie.scale = (pcie_l, pcb_t, pcie_h)
    pcie.location = (-LENGTH * 0.1, pcb_t/2, -HEIGHT/2 - pcie_h/2)
    pcie.data.materials.append(mats['pcie'])
    
    # 6. Power Connector (Top right, Z = HEIGHT/2)
    bpy.ops.mesh.primitive_cube_add(size=1)
    power = bpy.context.active_object
    power.name = "power connector"
    power.scale = (0.015, 0.015, 0.01)
    power.location = (LENGTH/2 - 0.02, pcb_t + hs_base_t/2, HEIGHT/2 + 0.005)
    power.data.materials.append(mats['power'])
    
    # 7. Shroud (Gold cover on the front, Y = 0.038 to 0.040)
    # The A100 shroud also wraps around the edges slightly.
    shroud_t = 0.002
    bpy.ops.mesh.primitive_cube_add(size=1)
    shroud = bpy.context.active_object
    shroud.name = "shroud"
    # Make it slightly smaller than the full height so we can see fins at the top/bottom edges
    shroud.scale = (LENGTH, shroud_t, HEIGHT * 0.75)
    shroud.location = (0, WIDTH - shroud_t/2, 0)
    
    # Bevel the shroud for a premium look
    bpy.context.view_layer.objects.active = shroud
    bevel = shroud.modifiers.new(name="Bevel", type='BEVEL')
    bevel.width = 0.005
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier="Bevel")
    bpy.ops.object.shade_smooth()
    shroud.data.materials.append(mats['shroud'])
    
    # 8. Branding Face (Logo plane)
    bpy.ops.mesh.primitive_plane_add(size=1)
    logo_plane = bpy.context.active_object
    logo_plane.name = "MAlogo"
    
    # The texture is 1024x256 (4:1 aspect ratio). Let's make it a nice size on the shroud.
    logo_w = LENGTH * 0.7
    logo_h = logo_w / 4
    logo_plane.scale = (logo_w, logo_h, 1)
    
    # Place just in front of the shroud
    logo_plane.location = (0, WIDTH + 0.0002, 0)
    logo_plane.rotation_euler = (math.pi/2, 0, math.pi)
    logo_plane.data.materials.append(mats['logo'])
    
    bpy.context.view_layer.objects.active = logo_plane
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.001)
    bpy.ops.object.mode_set(mode='OBJECT')

def export_glb():
    out_path = "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public/gpu_rtx.glb"
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False,
        export_materials='EXPORT'
    )
    print(f"Exported to {out_path}")

if __name__ == "__main__":
    clear_scene()
    mats = create_materials()
    build_a100(mats)
    export_glb()
