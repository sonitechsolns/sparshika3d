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
    
    mat_fan = bpy.data.materials.new(name="FanCharcoal")
    mat_fan.use_nodes = True
    bsdf = mat_fan.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = (0.06, 0.06, 0.07, 1.0)  # dark charcoal
    bsdf.inputs['Roughness'].default_value = 0.55
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
    
    # 2. 24 vertical 2.5" drive bays filling the space between the ears (the
    #    R760's high-density front). Bare drives are the default front face; the
    #    hex/Dell security bezel (built below) is toggleable in the app and clips
    #    over these when shown. Each bay: caddy + orange circular pull tab (top) +
    #    green activity LED (bottom). Not parented (the bay carries a non-uniform
    #    scale that would distort children).
    bay_area_w = WIDTH - (2 * ear_w)
    n_bays = 24
    pitch = bay_area_w / n_bays
    bay_w = pitch - 0.0012
    bay_h = HEIGHT - 0.006
    left_edge = -WIDTH / 2 + ear_w

    for i in range(n_bays):
        x_pos = left_edge + pitch * (i + 0.5)

        # Caddy body — front face flush with bezel_y.
        bpy.ops.mesh.primitive_cube_add(size=1)
        bay = bpy.context.active_object
        bay.name = f"drive_bay_{i+1}"
        bay.data.name = bay.name
        bay.scale = (bay_w, 0.11, bay_h)
        bay.location = (x_pos, bezel_y + 0.055, 0)
        bay.data.materials.append(mats['chassis'])

        # Orange circular pull tab at the top.
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=bay_w * 0.30, depth=0.004)
        tab = bpy.context.active_object
        tab.name = f"drive_latch_{i+1}"
        tab.data.name = tab.name
        tab.rotation_euler = (math.pi / 2, 0, 0)     # circular face toward the front (-Y)
        tab.location = (x_pos, bezel_y - 0.004, bay_h / 2 - 0.009)
        tab.data.materials.append(mats['orange'])

        # Green activity LED near the bottom.
        bpy.ops.mesh.primitive_cube_add(size=1)
        led = bpy.context.active_object
        led.name = f"drive_indicator_{i+1}"
        led.data.name = led.name
        led.scale = (bay_w * 0.40, 0.002, 0.004)
        led.location = (x_pos, bezel_y - 0.004, -bay_h / 2 + 0.012)
        led.data.materials.append(mats['green'])

    # 3. Hex Mesh Overlay — a solid grille panel with hexagonal holes cut out
    #    via a boolean. This yields clean, uniform struts. The old approach tiled
    #    individual hex *rings* whose shared edges overlapped and looked distorted.
    R = 0.015              # honeycomb lattice radius (center spacing = sqrt(3)*R)
    r_hole = 0.011         # hole circumradius; strut width = sqrt(3)*(R - r_hole)
    w = math.sqrt(3) * R   # horizontal center spacing
    row_h = 1.5 * R        # vertical row spacing (rows offset by w/2)
    panel_t = 0.006
    panel_y = bezel_y - 0.013

    # Solid grille panel spanning the bay area between the ears.
    bpy.ops.mesh.primitive_cube_add(size=1)
    panel = bpy.context.active_object
    panel.name = "front_hex_mesh"
    panel.data.name = panel.name
    panel.scale = (bay_area_w, panel_t, HEIGHT - 0.004)
    panel.location = (0, panel_y, 0)

    # Build the full grid of pointy-top hexagonal hole cutters in one bmesh.
    bm = bmesh.new()
    ncol = int(bay_area_w / w) + 4
    nrow = int(HEIGHT / row_h) + 4
    x0 = -(ncol - 1) * w / 2
    z0 = -(nrow - 1) * row_h / 2

    def add_hex_prism(cx, cz):
        top = [bm.verts.new((cx + math.cos(math.radians(30 + i * 60)) * r_hole,
                              panel_t,
                              cz + math.sin(math.radians(30 + i * 60)) * r_hole))
               for i in range(6)]
        bot = [bm.verts.new((v.co.x, -panel_t, v.co.z)) for v in top]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new((top[i], top[j], bot[j], bot[i]))

    for rz in range(nrow):
        cz = z0 + rz * row_h
        x_off = (w / 2) if (rz % 2) else 0.0   # offset every other row → honeycomb
        for cxi in range(ncol):
            add_hex_prism(x0 + x_off + cxi * w, cz)

    cutter_mesh = bpy.data.meshes.new("hex_cutters")
    bm.to_mesh(cutter_mesh)
    bm.free()
    cutter = bpy.data.objects.new("hex_cutters", cutter_mesh)
    bpy.context.collection.objects.link(cutter)
    cutter.location = (0, panel_y, 0)

    # Cut the holes out of the panel.
    bpy.context.view_layer.objects.active = panel
    boolean = panel.modifiers.new(name="holes", type='BOOLEAN')
    boolean.operation = 'DIFFERENCE'
    boolean.solver = 'EXACT'
    boolean.object = cutter
    bpy.ops.object.modifier_apply(modifier="holes")
    bpy.data.objects.remove(cutter, do_unlink=True)
    panel.data.materials.append(mats['bezel'])
    
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


def make_system_fan(name, center, mats, scale=1.0):
    """Build one server fan: a hub cylinder (r=15mm) with 7 blades radiating out,
    joined into a single object named `name`.

    Blade: 40mm long x 12mm wide x 2mm thick, pitched 20 deg about its own radial
    axis to read as an airfoil. Blades attach at the hub edge and radiate outward.
    The spin axis is Y (front-to-back airflow); the blade disc lies in the XZ plane.

    `scale` uniformly shrinks/grows the whole fan (proportions preserved) — the
    full 110mm fan is scaled to ~75mm to fit inside the 2U chassis.
    """
    import mathutils

    hub_r = 0.015 * scale              # 15mm hub radius
    hub_depth = 0.014 * scale
    n_blades = 7
    pitch = math.radians(20)
    blade_len = 0.040 * scale          # 40mm radial length
    blade_w = 0.012 * scale            # 12mm tangential width
    blade_t = 0.002 * scale            # 2mm thickness
    radial_off = hub_r + blade_len / 2  # inner end meets the hub edge

    cx, cy, cz = center
    parts = []

    # Hub — cylinder with its axis along Y.
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=hub_r, depth=hub_depth)
    hub = bpy.context.active_object
    hub.rotation_euler = (math.pi / 2, 0, 0)
    hub.location = center
    hub.data.materials.append(mats['heatsink'])
    parts.append(hub)

    # Blades — unit cube scaled + pitched (Rx) + pushed out (+X) + spun around Y.
    Tc = mathutils.Matrix.Translation(center)
    S = mathutils.Matrix.Diagonal((blade_len, blade_t, blade_w, 1.0))
    Rpitch = mathutils.Matrix.Rotation(pitch, 4, 'X')
    Tout = mathutils.Matrix.Translation((radial_off, 0, 0))
    for k in range(n_blades):
        bpy.ops.mesh.primitive_cube_add(size=1)
        bl = bpy.context.active_object
        Rspin = mathutils.Matrix.Rotation(k * (2 * math.pi / n_blades), 4, 'Y')
        bl.matrix_world = Tc @ Rspin @ Tout @ Rpitch @ S
        bl.data.materials.append(mats['fan'])
        parts.append(bl)

    # Join into one object with its origin at the fan center.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = hub
    bpy.ops.object.join()
    hub.name = name
    hub.data.name = name
    return hub


def make_fan_module(name, center, mats, fan_scale):
    """A tall black square shroud with a circular bore housing a spinnable blade
    assembly, plus an orange accent tab on top — the R760's hot-swap fan module.

    The blade assembly keeps the plain `name` (so the app finds and spins it);
    the static shroud/tab get `_shroud`/`_tab` suffixes (excluded from spin).
    """
    cx, cy, cz = center
    sw, sd, sh = 0.066, 0.045, 0.082          # shroud w x depth(Y) x height (tall)
    fan_r = 0.055 * fan_scale                  # outer blade radius from make_system_fan
    bore_r = fan_r + 0.003

    # Shroud box with a circular bore cut through it (axis along Y).
    bpy.ops.mesh.primitive_cube_add(size=1)
    shroud = bpy.context.active_object
    shroud.scale = (sw, sd, sh)
    shroud.location = center
    shroud.data.materials.append(mats['bezel'])   # black housing (assign BEFORE the
                                                  # boolean so the result keeps it)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=bore_r, depth=sd * 3)
    cutter = bpy.context.active_object
    cutter.rotation_euler = (math.pi / 2, 0, 0)
    cutter.location = center
    bpy.context.view_layer.objects.active = shroud
    b = shroud.modifiers.new("bore", 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.solver = 'EXACT'
    b.object = cutter
    bpy.ops.object.modifier_apply(modifier="bore")
    bpy.data.objects.remove(cutter, do_unlink=True)
    shroud.name = f"{name}_shroud"
    shroud.data.name = shroud.name

    # Circular blade assembly inside the bore (spinnable).
    make_system_fan(name, center, mats, scale=fan_scale)

    # Orange accent tab on top of the module.
    bpy.ops.mesh.primitive_cube_add(size=1)
    tab = bpy.context.active_object
    tab.name = f"{name}_tab"
    tab.data.name = tab.name
    tab.scale = (sw * 0.5, sd * 0.45, 0.006)
    tab.location = (cx, cy, cz + sh / 2 + 0.002)
    tab.data.materials.append(mats['orange'])


def build_internal(mats):
    # Motherboard
    bpy.ops.mesh.primitive_cube_add(size=1)
    mobo = bpy.context.active_object
    mobo.name = "motherboard"
    mobo.data.name = mobo.name
    mobo.scale = (WIDTH * 0.9, DEPTH * 0.6, 0.005)
    mobo.location = (0, DEPTH * 0.1, -HEIGHT/2 + 0.005)
    mobo.data.materials.append(mats['mobo'])
    
    # 1. Fan Wall — 6 fan modules in a row. Each is a tall black square shroud
    #    housing a circular blade assembly, with an orange accent tab on top.
    fan_y = -DEPTH * 0.3
    fan_scale = 0.060 / 0.110          # ~60mm fans, six across the width

    # Mounting bracket behind the fans.
    bpy.ops.mesh.primitive_cube_add(size=1)
    cage = bpy.context.active_object
    cage.name = "fan_cage"
    cage.data.name = cage.name
    cage.scale = (WIDTH - 0.02, 0.02, HEIGHT - 0.006)
    cage.location = (0, fan_y + 0.035, 0)
    cage.data.materials.append(mats['chassis'])

    for i in range(6):
        x_pos = (i - 2.5) * 0.077
        make_fan_module(f"system_fan_{i+1}", (x_pos, fan_y, 0), mats, fan_scale)

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
        # Black triangular heatsink: vertical fins whose heights follow a triangle
        # (tall at the center ridge, short at the edges), over a solid base plate,
        # all joined into one object. Reads as both "triangular" and "finned".
        top_h = HEIGHT * 0.62
        n_fins = 15
        fin_w, fin_gap, depth = 0.004, 0.0035, 0.11
        span = n_fins * (fin_w + fin_gap)
        parts = []
        for k in range(n_fins):
            x = -span / 2 + k * (fin_w + fin_gap) + fin_w / 2
            frac = 1.0 - abs(x) / (span / 2 + 1e-6)      # 1 at center → 0 at edges
            fh = 0.012 + frac * (top_h - 0.012)
            bpy.ops.mesh.primitive_cube_add(size=1)
            fin = bpy.context.active_object
            fin.scale = (fin_w, depth, fh)
            fin.location = (x, cpu_y, base_z + fh / 2)
            fin.data.materials.append(mats['bezel'])   # black
            parts.append(fin)
        # Solid base plate under the fins.
        bpy.ops.mesh.primitive_cube_add(size=1)
        base = bpy.context.active_object
        base.scale = (span, depth, 0.012)
        base.location = (0, cpu_y, base_z + 0.006)
        base.data.materials.append(mats['bezel'])
        parts.append(base)
        # Join into a single heatsink object (name preserved for the click-map).
        bpy.ops.object.select_all(action='DESELECT')
        for pt in parts:
            pt.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        hs = parts[0]
        hs.name = f"cpu_heatsink_{c+1}"
        hs.data.name = hs.name

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
