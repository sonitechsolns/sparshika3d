import bpy
import bmesh
import math
import os

# Dell R760 dimensions in meters
WIDTH = 0.4826  # 19 inches rack width
HEIGHT = 0.0868 # 2U height
DEPTH = 0.758   # 758mm depth

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def setup_materials():
    mats = {}
    
    mat_chassis = bpy.data.materials.new(name="ChassisMetal")
    mat_chassis.use_nodes = True
    bsdf = mat_chassis.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.3, 0.3, 0.3, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.8
    bsdf.inputs['Roughness'].default_value = 0.4
    mats['chassis'] = mat_chassis

    mat_bezel = bpy.data.materials.new(name="BezelMesh")
    mat_bezel.use_nodes = True
    bsdf = mat_bezel.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.05, 0.05, 0.05, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.7
    mats['bezel'] = mat_bezel

    mat_logo = bpy.data.materials.new(name="LogoBacklit")
    mat_logo.use_nodes = True
    bsdf = mat_logo.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.6, 0.8, 1.0, 1.0)
    bsdf.inputs['Emission Color'].default_value = (0.1, 0.5, 1.0, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 3.0
    mats['logo'] = mat_logo

    mat_orange = bpy.data.materials.new(name="LatchOrange")
    mat_orange.use_nodes = True
    bsdf = mat_orange.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.8, 0.3, 0.0, 1.0)
    mats['orange'] = mat_orange
    
    mat_green = bpy.data.materials.new(name="LatchGreen")
    mat_green.use_nodes = True
    bsdf = mat_green.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.1, 0.7, 0.2, 1.0)
    mats['green'] = mat_green

    mat_mobo = bpy.data.materials.new(name="Motherboard")
    mat_mobo.use_nodes = True
    bsdf = mat_mobo.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.05, 0.2, 0.08, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    mats['mobo'] = mat_mobo

    mat_hs = bpy.data.materials.new(name="Heatsink")
    mat_hs.use_nodes = True
    bsdf = mat_hs.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.15, 0.15, 0.15, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.9
    mats['heatsink'] = mat_hs
    
    mat_fan = bpy.data.materials.new(name="FanPlastic")
    mat_fan.use_nodes = True
    bsdf = mat_fan.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1.0)
    mats['fan'] = mat_fan

    mat_shroud = bpy.data.materials.new(name="ShroudPlastic")
    mat_shroud.use_nodes = True
    bsdf = mat_shroud.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.08, 0.08, 0.08, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.5
    mats['shroud'] = mat_shroud

    # DIMM memory modules (dark green PCB with gold contacts feel)
    mat_dimm = bpy.data.materials.new(name="DIMM")
    mat_dimm.use_nodes = True
    bsdf = mat_dimm.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.02, 0.12, 0.05, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.6
    mats['dimm'] = mat_dimm

    # Dell wordmark DECAL — image texture, NOT 3D text (per spec branding rule).
    mat_dell = bpy.data.materials.new(name="DellDecal")
    mat_dell.use_nodes = True
    nt = mat_dell.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    img_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "dell_logo.png")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Emission Color'].default_value = (0.0, 0.16, 0.33, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 0.5
    try:
        mat_dell.blend_method = 'BLEND'  # ignored on Blender 4.2+ EEVEE Next; glTF still reads alpha
    except (AttributeError, TypeError):
        pass
    mats['dell_decal'] = mat_dell

    return mats

def build_chassis(mats):
    # Chassis as a HOLLOW tray (floor + 3 walls, open top) so that hiding the
    # top cover actually reveals the internals. The old solid-cube chassis
    # buried every internal part inside a filled block.
    chassis_d = DEPTH - 0.05
    cy = 0.025
    t = 0.004  # sheet-metal wall thickness

    def panel(name, sx, sy, sz, x, y, z):
        bpy.ops.mesh.primitive_cube_add(size=1)
        o = bpy.context.active_object
        o.name = name
        o.data.name = name
        o.scale = (sx, sy, sz)
        o.location = (x, y, z)
        o.data.materials.append(mats['chassis'])
        return o

    panel("chassis_floor", WIDTH, chassis_d, t, 0, cy, -HEIGHT/2 + t/2)
    panel("chassis_wall_left",  t, chassis_d, HEIGHT, -WIDTH/2 + t/2, cy, 0)
    panel("chassis_wall_right", t, chassis_d, HEIGHT,  WIDTH/2 - t/2, cy, 0)
    panel("chassis_wall_rear",  WIDTH, t, HEIGHT, 0, cy + chassis_d/2 - t/2, 0)

    # Top Cover — thin lid flush with the top opening, toggled from the app.
    bpy.ops.mesh.primitive_cube_add(size=1)
    cover = bpy.context.active_object
    cover.name = "top_cover"
    cover.data.name = cover.name
    cover.scale = (WIDTH, chassis_d, 0.003)
    cover.location = (0, cy, HEIGHT/2 - 0.0015)
    cover.data.materials.append(mats['chassis'])

def build_front_bezel(mats):
    bezel_y = -DEPTH/2 + 0.015
    ear_w = 0.025
    
    # 1. Left and Right Control Panels (Ears)
    for side, name in [(-1, 'left'), (1, 'right')]:
        bpy.ops.mesh.primitive_cube_add(size=1)
        ear = bpy.context.active_object
        ear.name = f"bezel_ear_{name}"
        ear.data.name = ear.name
        ear.scale = (ear_w, 0.03, HEIGHT)
        ear.location = (side * (WIDTH/2 - ear_w/2), bezel_y, 0)
        ear.data.materials.append(mats['bezel'])
        
        # Details on ears
        if side == -1: # Power button
            bpy.ops.mesh.primitive_cube_add(size=1)
            btn = bpy.context.active_object
            btn.name = "power_button"
            btn.data.name = btn.name
            btn.scale = (0.01, 0.002, 0.005)
            btn.location = (side * (WIDTH/2 - ear_w/2), bezel_y - 0.015, HEIGHT * 0.3)
            btn.data.materials.append(mats['chassis'])
            btn.parent = ear
    
    # 2. 8-Bay Drives (Vertical orientation, filling space between ears)
    bay_area_w = WIDTH - (2 * ear_w)
    bay_w = (bay_area_w / 8) - 0.002
    bay_h = HEIGHT - 0.005
    
    for i in range(8):
        # Caddy body
        bpy.ops.mesh.primitive_cube_add(size=1)
        bay = bpy.context.active_object
        bay.name = f"drive_bay_{i+1}"
        bay.data.name = bay.name
        bay.scale = (bay_w, 0.15, bay_h)
        
        x_pos = (-WIDTH/2 + ear_w) + (bay_w + 0.002) * i + (bay_w/2) + 0.001
        bay.location = (x_pos, bezel_y + 0.075, 0)
        bay.data.materials.append(mats['chassis'])
        
        # Release Latch (Top part of drive)
        bpy.ops.mesh.primitive_cube_add(size=1)
        latch = bpy.context.active_object
        latch.name = f"drive_latch_{i+1}"
        latch.data.name = latch.name
        latch.scale = (bay_w * 0.9, 0.005, bay_h * 0.15)
        latch.location = (x_pos, bezel_y, HEIGHT/2 - (bay_h * 0.15)/2 - 0.005)
        
        # Orange/Green indicator
        bpy.ops.mesh.primitive_cube_add(size=1)
        indicator = bpy.context.active_object
        indicator.name = f"drive_indicator_{i+1}"
        indicator.data.name = indicator.name
        indicator.scale = (0.005, 0.002, 0.005)
        indicator.location = (x_pos, bezel_y - 0.0025, HEIGHT/2 - (bay_h * 0.15)/2 - 0.005)
        
        if i == 0:
            indicator.data.materials.append(mats['green'])
        else:
            indicator.data.materials.append(mats['orange'])
            
        latch.data.materials.append(mats['bezel'])
        latch.parent = bay
        indicator.parent = bay

    # 3. Hex Mesh Overlay (Large structural honeycomb)
    import bmesh
    mesh_data = bpy.data.meshes.new("hex_base")
    hex_obj = bpy.data.objects.new("front_hex_mesh", mesh_data)
    bpy.context.collection.objects.link(hex_obj)
    
    bm = bmesh.new()
    r = 0.015 # 15mm radius for chunky hexagons
    w = math.sqrt(3) * r
    thickness = 0.005
    strut = 0.003
    
    def add_hex_ring(cx, cz):
        outer_verts = []
        inner_verts = []
        for i in range(6):
            angle = i * (math.pi / 3) + (math.pi / 6)
            x = cx + math.cos(angle) * r
            z = cz + math.sin(angle) * r
            outer_verts.append(bm.verts.new((x, 0, z)))
            
            x_in = cx + math.cos(angle) * (r - strut)
            z_in = cz + math.sin(angle) * (r - strut)
            inner_verts.append(bm.verts.new((x_in, 0, z_in)))
            
        for i in range(6):
            next_i = (i + 1) % 6
            bm.faces.new((outer_verts[i], outer_verts[next_i], inner_verts[next_i], inner_verts[i]))
            
    add_hex_ring(0, 0)
    add_hex_ring(w/2, 1.5 * r)
    
    bm.to_mesh(mesh_data)
    bm.free()
    
    solidify = hex_obj.modifiers.new(name="Solidify", type='SOLIDIFY')
    solidify.thickness = thickness
    
    array_x = hex_obj.modifiers.new(name="ArrayX", type='ARRAY')
    array_x.use_relative_offset = False
    array_x.use_constant_offset = True
    array_x.constant_offset_displace = (w, 0, 0)
    array_x.count = int(bay_area_w / w) + 2
    
    array_z = hex_obj.modifiers.new(name="ArrayZ", type='ARRAY')
    array_z.use_relative_offset = False
    array_z.use_constant_offset = True
    array_z.constant_offset_displace = (0, 0, 3 * r)
    array_z.count = int(HEIGHT / (3 * r)) + 2
    
    total_w = array_x.count * w
    total_h = array_z.count * 3 * r
    # Position in front of the drives
    hex_obj.location = (-total_w/2, bezel_y - 0.015, -total_h/2)
    hex_obj.data.materials.append(mats['bezel'])
    
    bpy.context.view_layer.objects.active = hex_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    bpy.ops.object.modifier_apply(modifier="ArrayX")
    bpy.ops.object.modifier_apply(modifier="ArrayZ")
    
    # 4. Center Dell badge — recessed dark backing disc + a TEXTURE DECAL.
    #    No 3D text: the wordmark is a baked image on a plane (spec requirement).
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.03, depth=0.004)
    logo_plate = bpy.context.active_object
    logo_plate.name = "logo_plate"
    logo_plate.data.name = logo_plate.name
    logo_plate.rotation_euler = (math.pi/2, 0, 0)
    logo_plate.location = (0, bezel_y - 0.016, 0)
    logo_plate.data.materials.append(mats['bezel'])

    bpy.ops.mesh.primitive_plane_add(size=1)
    decal = bpy.context.active_object
    decal.name = "dell_logo_decal"
    decal.data.name = decal.name
    # Face the front (-Y); the plane's front face points at the external viewer
    # so the wordmark reads correctly with a normal (un-mirrored) UV.
    decal.scale = (0.05, 0.05, 0.05)
    decal.rotation_euler = (math.pi/2, 0, 0)
    decal.location = (0, bezel_y - 0.019, 0)
    decal.data.materials.append(mats['dell_decal'])


def build_rear_panel(mats):
    rear_y = DEPTH/2
    
    # 1. PSUs (Left and Right extremes)
    psu_w = 0.07
    psu_h = HEIGHT * 0.45
    
    for side, i in [(-1, 1), (1, 2)]: # Left PSU=1, Right PSU=2
        bpy.ops.mesh.primitive_cube_add(size=1)
        psu = bpy.context.active_object
        psu.name = f"psu_{i}"
        psu.data.name = psu.name
        psu.scale = (psu_w, 0.15, psu_h)
        x_pos = side * (WIDTH/2 - psu_w/2 - 0.01)
        psu.location = (x_pos, rear_y - 0.075, -HEIGHT/2 + psu_h/2 + 0.01)
        psu.data.materials.append(mats['chassis'])
        
        # PSU Latch (Orange)
        bpy.ops.mesh.primitive_cube_add(size=1)
        latch = bpy.context.active_object
        latch.name = f"psu_latch_{i}"
        latch.data.name = latch.name
        latch.scale = (0.01, 0.01, psu_h * 0.6)
        latch.location = (x_pos - psu_w/2 + 0.01, rear_y + 0.005, -HEIGHT/2 + psu_h/2 + 0.01)
        latch.data.materials.append(mats['orange'])
        latch.parent = psu
        
        # PSU Fan Grille
        bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=16)
        fan = bpy.context.active_object
        fan.name = f"psu_fan_{i}"
        fan.data.name = fan.name
        fan.scale = (psu_h*0.4, psu_h*0.4, 0.01)
        fan.rotation_euler = (math.pi/2, 0, 0)
        fan.location = (x_pos + 0.01, rear_y, -HEIGHT/2 + psu_h/2 + 0.01)
        fan.data.materials.append(mats['bezel'])
        fan.parent = psu
        
        # AC Receptacle
        bpy.ops.mesh.primitive_cube_add(size=1)
        ac = bpy.context.active_object
        ac.name = f"psu_ac_{i}"
        ac.data.name = ac.name
        ac.scale = (0.02, 0.01, 0.015)
        ac.location = (x_pos - psu_w/4, rear_y, -HEIGHT/2 + psu_h/2 + 0.01)
        ac.data.materials.append(mats['bezel'])
        ac.parent = psu

    # 2. Rear Drives (Top Center)
    bpy.ops.mesh.primitive_cube_add(size=1)
    rdrives = bpy.context.active_object
    rdrives.name = "rear_drive_cage"
    rdrives.data.name = rdrives.name
    rdrives.scale = (0.15, 0.1, HEIGHT * 0.4)
    rdrives.location = (0, rear_y - 0.05, HEIGHT/2 - (HEIGHT * 0.4)/2 - 0.01)
    rdrives.data.materials.append(mats['chassis'])
    
    # Details on rear drives
    for i in range(2):
        bpy.ops.mesh.primitive_cube_add(size=1)
        rd = bpy.context.active_object
        rd.name = f"rear_drive_{i+1}"
        rd.data.name = rd.name
        rd.scale = (0.065, 0.005, HEIGHT * 0.35)
        rd.location = (-0.035 + (i*0.07), rear_y + 0.002, HEIGHT/2 - (HEIGHT * 0.4)/2 - 0.01)
        rd.data.materials.append(mats['bezel'])
        rd.parent = rdrives

    # 3. I/O Cluster (Bottom Center)
    bpy.ops.mesh.primitive_cube_add(size=1)
    io = bpy.context.active_object
    io.name = "io_cluster"
    io.data.name = io.name
    io.scale = (0.2, 0.02, HEIGHT * 0.3)
    io.location = (0, rear_y - 0.01, -HEIGHT/2 + (HEIGHT * 0.3)/2 + 0.01)
    io.data.materials.append(mats['chassis'])

    # 4. PCIe Slots
    for i in range(4):
        bpy.ops.mesh.primitive_cube_add(size=1)
        slot = bpy.context.active_object
        slot.name = f"pcie_slot_{i+1}"
        slot.data.name = slot.name
        slot.scale = (0.02, 0.01, HEIGHT * 0.45)
        slot.location = (-0.15 + i*0.03, rear_y, 0)
        slot.data.materials.append(mats['bezel'])


def build_internal(mats):
    # Motherboard
    bpy.ops.mesh.primitive_cube_add(size=1)
    mobo = bpy.context.active_object
    mobo.name = "motherboard"
    mobo.data.name = mobo.name
    mobo.scale = (WIDTH * 0.9, DEPTH * 0.6, 0.005)
    mobo.location = (0, DEPTH * 0.1, -HEIGHT/2 + 0.005)
    mobo.data.materials.append(mats['mobo'])
    
    # 1. Fan Wall (6 hot-swap fans directly behind drive backplane)
    fan_y = -DEPTH * 0.3
    fan_w = WIDTH * 0.15
    fan_cage = bpy.ops.mesh.primitive_cube_add(size=1)
    cage = bpy.context.active_object
    cage.name = "fan_cage"
    cage.data.name = cage.name
    cage.scale = (WIDTH - 0.02, 0.08, HEIGHT - 0.01)
    cage.location = (0, fan_y, 0)
    cage.data.materials.append(mats['chassis'])
    
    for i in range(6):
        # Fan Module
        bpy.ops.mesh.primitive_cube_add(size=1)
        module = bpy.context.active_object
        module.name = f"fan_module_{i+1}"
        module.data.name = module.name
        module.scale = (fan_w * 0.9, 0.07, HEIGHT * 0.8)
        
        x_pos = -WIDTH/2 + (fan_w/2) + i * fan_w + 0.015
        module.location = (x_pos, fan_y, 0)
        module.data.materials.append(mats['bezel'])
        
        # Dual Rotors (Visualized as cylinders)
        for j, y_off in [(1, -0.015), (2, 0.015)]:
            bpy.ops.mesh.primitive_cylinder_add(radius=1, depth=1, vertices=16)
            fan = bpy.context.active_object
            fan.name = f"system_fan_{i+1}_rotor_{j}"
            fan.data.name = fan.name
            fan.scale = (fan_w * 0.4, fan_w * 0.4, 0.02)
            fan.rotation_euler = (math.pi/2, 0, 0)
            fan.location = (x_pos, fan_y + y_off, 0)
            fan.data.materials.append(mats['fan'])
        
        # Orange Pull Tab on top
        bpy.ops.mesh.primitive_cube_add(size=1)
        tab = bpy.context.active_object
        tab.name = f"fan_tab_{i+1}"
        tab.data.name = tab.name
        tab.scale = (0.015, 0.015, 0.01)
        tab.location = (x_pos, fan_y, HEIGHT/2 - 0.01)
        tab.data.materials.append(mats['orange'])
        tab.parent = module

    # 2. Air Shroud — a low duct just BEHIND the fan wall, so it channels air
    #    without hiding the CPUs/DIMMs (which sit further back and stay visible).
    shroud_y = -0.12
    bpy.ops.mesh.primitive_cube_add(size=1)
    shroud = bpy.context.active_object
    shroud.name = "air_shroud"
    shroud.data.name = shroud.name
    shroud.scale = (WIDTH * 0.7, DEPTH * 0.16, HEIGHT * 0.55)
    shroud.location = (0, shroud_y, -HEIGHT * 0.05)
    shroud.data.materials.append(mats['shroud'])

    # 3. PCIe Risers (3 distinct risers at the rear)
    # Riser 1 (Left), Riser 3 (Center), Riser 4 (Right)
    riser_positions = [(-0.16, "1"), (0, "3"), (0.16, "4")]
    for i, (x_pos, label) in enumerate(riser_positions):
        # Riser Body
        bpy.ops.mesh.primitive_cube_add(size=1)
        riser = bpy.context.active_object
        riser.name = f"riser_{label}"
        riser.data.name = riser.name
        riser.scale = (0.12, 0.2, HEIGHT * 0.9)
        riser.location = (x_pos, DEPTH * 0.32, 0)
        riser.data.materials.append(mats['bezel'])
        
        # Blue Touch Point / Handle
        bpy.ops.mesh.primitive_cube_add(size=1)
        handle = bpy.context.active_object
        handle.name = f"riser_handle_{label}"
        handle.data.name = handle.name
        handle.scale = (0.08, 0.02, 0.01)
        handle.location = (x_pos, DEPTH * 0.32, HEIGHT/2 - 0.01)
        handle.data.materials.append(mats['logo']) # Blue
        handle.parent = riser
        
        # Silver Bracket
        bpy.ops.mesh.primitive_cube_add(size=1)
        bracket = bpy.context.active_object
        bracket.name = f"riser_bracket_{label}"
        bracket.data.name = bracket.name
        bracket.scale = (0.005, 0.18, HEIGHT * 0.8)
        bracket.location = (x_pos + 0.055, DEPTH * 0.32, 0)
        bracket.data.materials.append(mats['chassis'])
        bracket.parent = riser

def build_cpus_memory(mats):
    # Two socketed CPU heatsinks (finned) with flanking DIMM banks, sitting on
    # the motherboard in the center bay — the payoff when the cover is opened.
    base_z = -HEIGHT/2 + 0.008
    for c, cpu_y in enumerate([-0.02, 0.12]):
        top_h = HEIGHT * 0.55
        bpy.ops.mesh.primitive_cube_add(size=1)
        hs = bpy.context.active_object
        hs.name = f"cpu_heatsink_{c+1}"
        hs.data.name = hs.name
        hs.scale = (0.115, 0.11, top_h)
        hs.location = (0, cpu_y, base_z + top_h/2)
        hs.data.materials.append(mats['heatsink'])

        # Fins: a thin plate arrayed across X (modifier applied on export).
        bpy.ops.mesh.primitive_cube_add(size=1)
        fin = bpy.context.active_object
        fin.name = f"cpu_fins_{c+1}"
        fin.data.name = fin.name
        fin.scale = (0.004, 0.10, top_h * 0.92)
        fin.location = (-0.052, cpu_y, base_z + top_h/2 + 0.003)
        fin.data.materials.append(mats['heatsink'])
        arr = fin.modifiers.new("fins", 'ARRAY')
        arr.use_relative_offset = False
        arr.use_constant_offset = True
        arr.constant_offset_displace = (0.009, 0, 0)
        arr.count = 12
        fin.parent = hs

        # DIMM banks flanking both sides of the socket.
        for side in (-1, 1):
            tag = 'L' if side < 0 else 'R'
            for d in range(6):
                bpy.ops.mesh.primitive_cube_add(size=1)
                dm = bpy.context.active_object
                dm.name = f"dimm_{c+1}_{tag}_{d+1}"
                dm.data.name = dm.name
                dm.scale = (0.05, 0.003, HEIGHT * 0.5)
                dm.location = (side * 0.105, cpu_y - 0.033 + d * 0.012,
                               base_z + (HEIGHT * 0.5)/2)
                dm.data.materials.append(mats['dimm'])


def export_glb():
    filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "server_r760.glb")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_materials='EXPORT'
    )
    print(f"Exported to {filepath}")

def main():
    clear_scene()
    mats = setup_materials()
    build_chassis(mats)
    build_front_bezel(mats)
    build_rear_panel(mats)
    build_internal(mats)
    build_cpus_memory(mats)
    export_glb()

if __name__ == "__main__":
    main()
