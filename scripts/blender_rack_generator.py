import bpy
import bmesh
import math
import os

GPU_LENGTH = 0.280
GPU_HEIGHT = 0.115
GPU_THICKNESS = 0.050

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def create_materials():
    mats = {}
    
    mat_shroud = bpy.data.materials.new(name="Shroud_Mat")
    mat_shroud.use_nodes = True
    bsdf = mat_shroud.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.8
    mats['shroud'] = mat_shroud
    
    mat_fan = bpy.data.materials.new(name="Fan_Mat")
    mat_fan.use_nodes = True
    bsdf = mat_fan.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.2, 0.2, 0.22, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.5
    mats['fan'] = mat_fan
    
    mat_metal = bpy.data.materials.new(name="Metal_Mat")
    mat_metal.use_nodes = True
    bsdf = mat_metal.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.7, 0.7, 0.7, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.3
    mats['metal'] = mat_metal
    
    mat_body = bpy.data.materials.new(name="Body_Mat")
    mat_body.use_nodes = True
    mat_body.node_tree.nodes["Principled BSDF"].inputs['Base Color'].default_value = (0.8, 0.7, 0.5, 1.0) # Light champagne gold
    mat_body.node_tree.nodes["Principled BSDF"].inputs['Metallic'].default_value = 0.5
    mat_body.node_tree.nodes["Principled BSDF"].inputs['Roughness'].default_value = 0.5
    mats['body'] = mat_body
    
    mat_pcb = bpy.data.materials.new(name="PCB_Mat")
    mat_pcb.use_nodes = True
    bsdf = mat_pcb.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.01, 0.08, 0.02, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
    mats['pcb'] = mat_pcb
    
    mat = bpy.data.materials.new(name="Dark_Mat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs['Roughness'].default_value = 0.7
    mats['dark'] = mat
    
    mat_gold = bpy.data.materials.new(name="Gold_Mat")
    mat_gold.use_nodes = True
    bsdf = mat_gold.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.8, 0.6, 0.1, 1.0)
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.2
    mats['gold'] = mat_gold
    
    mat_cable = bpy.data.materials.new(name="Cable_Mat")
    mat_cable.use_nodes = True
    bsdf = mat_cable.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.6
    mats['cable'] = mat_cable
    
    mat = bpy.data.materials.new(name="Branding_Mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    
    tex_path = os.path.join(os.path.dirname(bpy.data.filepath) if bpy.data.filepath else "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public", "branding.png")
    
    if os.path.exists(tex_path):
        img = bpy.data.images.load(tex_path)
        tex_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex_node.image = img
        mat.node_tree.links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
    
    mats['branding'] = mat
    
    return mats

def create_vent_cutters():
    bpy.ops.mesh.primitive_cube_add(size=1)
    cutter = bpy.context.active_object
    cutter.name = "Vent_Cutter"
    cutter.scale = (0.06, 0.002, 0.03)
    bpy.ops.object.transform_apply(scale=True)
    
    mod = cutter.modifiers.new(name="Array", type='ARRAY')
    mod.count = 15
    mod.use_relative_offset = False
    mod.use_constant_offset = True
    mod.constant_offset_displace = (0, 0.006, 0)
    
    cutter.location = (0, -GPU_LENGTH/2 + 0.1, GPU_HEIGHT/2 + 0.02)
    return cutter

def create_gpu_body(mats):
    bpy.ops.mesh.primitive_cube_add(size=1)
    shroud = bpy.context.active_object
    shroud.name = "GPU_Shroud"
    shroud.scale = (GPU_THICKNESS, GPU_LENGTH, GPU_HEIGHT)
    shroud.location = (0, 0, GPU_HEIGHT / 2)
    bpy.ops.object.transform_apply(location=True, scale=True)
    shroud.data.materials.append(mats['shroud'])
    
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(shroud.data)
    for v in bm.verts:
        if v.co.z > GPU_HEIGHT - 0.01:
            v.co.x *= 0.90 
    bmesh.update_edit_mesh(shroud.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    bevel = shroud.modifiers.new(name="Bevel", type='BEVEL')
    bevel.width = 0.004
    bevel.segments = 4
    bpy.ops.object.modifier_apply(modifier="Bevel")

    cutter = create_vent_cutters()
    bool_mod = shroud.modifiers.new(name="VentCut", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = cutter
    bpy.context.view_layer.objects.active = shroud
    bpy.ops.object.modifier_apply(modifier="VentCut")
    bpy.data.objects.remove(cutter, do_unlink=True)

    bpy.ops.mesh.primitive_cube_add(size=1)
    pcb = bpy.context.active_object
    pcb.name = "GPU_PCB"
    pcb.scale = (0.002, GPU_LENGTH - 0.002, GPU_HEIGHT + 0.005) 
    pcb.location = (-GPU_THICKNESS/2 - 0.001, 0, GPU_HEIGHT/2 - 0.0025)
    bpy.ops.object.transform_apply(location=True, scale=True)
    pcb.data.materials.append(mats['pcb'])
    pcb.parent = shroud
    
    bpy.ops.mesh.primitive_cube_add(size=1)
    pcie = bpy.context.active_object
    pcie.name = "PCIe_Connector"
    pcie.scale = (0.0025, 0.08, 0.01)
    pcie.location = (-GPU_THICKNESS/2 - 0.001, -GPU_LENGTH/2 + 0.04 + 0.04, -0.005)
    bpy.ops.object.transform_apply(location=True, scale=True)
    pcie.data.materials.append(mats['gold'])
    pcie.parent = shroud
    
    bpy.ops.mesh.primitive_cube_add(size=1)
    io = bpy.context.active_object
    io.name = "IO_Bracket"
    io.scale = (GPU_THICKNESS + 0.02, 0.002, GPU_HEIGHT + 0.02)
    io.location = (0, GPU_LENGTH/2 + 0.001, GPU_HEIGHT/2 - 0.01)
    bpy.ops.object.transform_apply(location=True, scale=True)
    io.data.materials.append(mats['metal'])
    io.parent = shroud

    bpy.ops.mesh.primitive_plane_add(size=1)
    branding = bpy.context.active_object
    branding.name = "GPU_Branding"
    branding.scale = (GPU_LENGTH * 0.32, GPU_HEIGHT * 0.15, 1)
    branding.rotation_euler = (math.radians(90), 0, math.radians(90))
    branding.location = (GPU_THICKNESS/2 + 0.001, 0, GPU_HEIGHT/2)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    branding.data.materials.append(mats['branding'])
    
    return shroud

def create_fan_assembly(name, radius, y_offset, parent_obj, mats):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=0.015)
    housing = bpy.context.active_object
    housing.name = f"{name}_Housing"
    housing.rotation_euler = (0, math.radians(90), 0)
    housing.location = (GPU_THICKNESS/2 - 0.005, y_offset, GPU_HEIGHT/2)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    housing.data.materials.append(mats['shroud'])
    housing.parent = parent_obj
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius-0.004, depth=0.03)
    cutter = bpy.context.active_object
    cutter.rotation_euler = (0, math.radians(90), 0)
    cutter.location = housing.location
    
    bool_mod = housing.modifiers.new(name="Hole", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = cutter
    bpy.context.view_layer.objects.active = housing
    bpy.ops.object.modifier_apply(modifier="Hole")
    bpy.data.objects.remove(cutter, do_unlink=True)
    
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(GPU_THICKNESS/2 - 0.005, y_offset, GPU_HEIGHT/2))
    rotor = bpy.context.active_object
    rotor.name = f"{name}_Rotor"
    rotor.rotation_euler = (0, math.radians(90), 0)
    rotor.parent = parent_obj
    housing.parent = parent_obj
    
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius*0.3, depth=0.016)
    hub = bpy.context.active_object
    hub.name = f"{name}_Hub"
    hub.location = (0, 0, 0)
    hub.rotation_euler = (0, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    hub.data.materials.append(mats['fan'])
    hub.parent = rotor
    
    num_blades = 9
    for i in range(num_blades):
        bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0,0,0))
        orbit = bpy.context.active_object
        orbit.name = f"{name}_Orbit_{i}"
        orbit.parent = rotor
        angle = (i / num_blades) * 2 * math.pi
        orbit.rotation_euler = (0, 0, angle)
        
        bpy.ops.mesh.primitive_cube_add(size=1)
        blade = bpy.context.active_object
        blade.name = f"{name}_Blade_{i}"
        blade.scale = (0.002, radius * 0.8, 0.01)
        blade.location = (0, radius * 0.45, 0)
        blade.rotation_euler = (math.radians(30), 0, 0)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        blade.data.materials.append(mats['fan'])
        blade.parent = orbit

def create_connector(parent_obj, mats, location, rotation=(0,0,0)):
    # Main housing block
    bpy.ops.mesh.primitive_cube_add(size=1)
    housing = bpy.context.active_object
    housing.name = "Connector_Housing"
    housing.scale = (0.02, 0.01, 0.015)
    housing.location = location
    housing.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, scale=True)
    if parent_obj:
        housing.parent = parent_obj
    housing.data.materials.append(mats['shroud'])
    
    # Add a ridge/clip on top
    bpy.ops.mesh.primitive_cube_add(size=1)
    clip = bpy.context.active_object
    clip.name = "Connector_Clip"
    clip.scale = (0.005, 0.005, 0.015)
    clip.location = (location[0], location[1] + 0.005, location[2])
    clip.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, scale=True)
    if parent_obj:
        clip.parent = parent_obj
    clip.data.materials.append(mats['shroud'])
    
    bpy.context.view_layer.objects.active = housing
    clip.select_set(True)
    bpy.ops.object.join()
    
    # Create the pin holes using boolean
    bpy.ops.mesh.primitive_cube_add(size=1)
    hole = bpy.context.active_object
    hole.name = "Connector_PinHoles"
    hole.scale = (0.0015, 0.005, 0.0015)
    bpy.ops.object.transform_apply(location=False, scale=True)
    
    hole.location = (location[0] - 0.0075 + 0.00125, location[1] - 0.005, location[2] - 0.0025 + 0.00125)
    
    arr1 = hole.modifiers.new(name="Arr1", type='ARRAY')
    arr1.count = 6
    arr1.use_relative_offset = False
    arr1.use_constant_offset = True
    arr1.constant_offset_displace = (0.003, 0, 0)
    
    arr2 = hole.modifiers.new(name="Arr2", type='ARRAY')
    arr2.count = 2
    arr2.use_relative_offset = False
    arr2.use_constant_offset = True
    arr2.constant_offset_displace = (0, 0, 0.003)
    
    bpy.context.view_layer.objects.active = hole
    bpy.ops.object.modifier_apply(modifier="Arr1")
    bpy.ops.object.modifier_apply(modifier="Arr2")
    
    bool_mod = housing.modifiers.new(name="Pins", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = hole
    bpy.context.view_layer.objects.active = housing
    bpy.ops.object.modifier_apply(modifier="Pins")
    bpy.data.objects.remove(hole, do_unlink=True)
    
    return housing

def create_cables(parent_obj, mats):
    gpu_conn_loc = (0, -GPU_LENGTH/2 + 0.03, GPU_HEIGHT)
    gpu_conn = create_connector(parent_obj, mats, gpu_conn_loc)
    
    rack_conn_loc = (0.3, -0.4, 0.15)
    rack_conn = create_connector(None, mats, rack_conn_loc)
    
    curveData = bpy.data.curves.new('cable_path', type='CURVE')
    curveData.dimensions = '3D'
    curveData.resolution_u = 4
    curveData.bevel_depth = 0.003
    curveData.use_fill_caps = True
    
    spline = curveData.splines.new('BEZIER')
    spline.bezier_points.add(3) 
    
    p0 = (gpu_conn_loc[0], gpu_conn_loc[1], gpu_conn_loc[2] + 0.0075)
    p3 = (rack_conn_loc[0], rack_conn_loc[1], rack_conn_loc[2] - 0.0075)
    
    p1 = (p0[0], p0[1] - 0.1, p0[2] + 0.1)
    p2 = (p3[0] - 0.1, p3[1] + 0.1, p3[2] - 0.1)
    
    pts = spline.bezier_points
    pts[0].co = p0
    pts[0].handle_left = (p0[0], p0[1], p0[2] - 0.05)
    pts[0].handle_right = (p0[0], p0[1], p0[2] + 0.05)
    
    pts[1].co = p1
    pts[1].handle_left = (p1[0], p1[1]+0.05, p1[2])
    pts[1].handle_right = (p1[0], p1[1]-0.05, p1[2])
    
    pts[2].co = p2
    pts[2].handle_left = (p2[0]-0.05, p2[1], p2[2])
    pts[2].handle_right = (p2[0]+0.05, p2[1], p2[2])
    
    pts[3].co = p3
    pts[3].handle_left = (p3[0], p3[1], p3[2] + 0.05)
    pts[3].handle_right = (p3[0], p3[1], p3[2] - 0.05)
    
    cable = bpy.data.objects.new('Cable_Mesh', curveData)
    bpy.context.collection.objects.link(cable)
    
    bpy.context.view_layer.objects.active = cable
    cable.select_set(True)
    bpy.ops.object.convert(target='MESH')
    cable.data.materials.append(mats['cable'])

def export_gltf(filepath):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False
    )

if __name__ == "__main__":
    clear_scene()
    mats = create_materials()
    gpu = create_gpu_body(mats)
    
    create_fan_assembly("Fan_1", 0.045, 0.075, gpu, mats)
    create_fan_assembly("Fan_2", 0.045, -0.075, gpu, mats)
    
    create_cables(gpu, mats)
    
    export_dir = "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public"
    os.makedirs(export_dir, exist_ok=True)
    export_path = os.path.join(export_dir, "gpu_pilot.glb")
    
    print("\n--- BRANDING DEBUG INFO ---")
    obj = bpy.data.objects.get("GPU_Branding")
    if obj:
        mesh = obj.data
        if mesh.uv_layers.active:
            uv_layer = mesh.uv_layers.active.data
            print(f"DEBUG: Found UV layer '{mesh.uv_layers.active.name}' with {len(uv_layer)} loops.")
            for i, loop in enumerate(uv_layer):
                print(f"DEBUG: UV[{i}] = {loop.uv.x}, {loop.uv.y}")
        
        if obj.material_slots:
            mat = obj.material_slots[0].material
            print(f"DEBUG: Material: {mat.name}")
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE':
                        img = node.image.filepath if node.image else "NONE"
                        print(f"DEBUG: Node {node.name} (Image Texture) -> {img}")
                for link in mat.node_tree.links:
                    print(f"DEBUG: Link {link.from_socket.name} -> {link.to_node.name}.{link.to_socket.name}")
    print("---------------------------\n")

    export_gltf(export_path)
    print(f"Exported to {export_path}")
