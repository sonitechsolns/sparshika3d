import bpy

def debug():
    obj = bpy.data.objects.get("GPU_Branding")
    if not obj:
        print("DEBUG: GPU_Branding object not found!")
        return

    print("DEBUG: GPU_Branding found.")
    
    # Check UVs
    mesh = obj.data
    if not mesh.uv_layers.active:
        print("DEBUG: No active UV layer found!")
    else:
        uv_layer = mesh.uv_layers.active.data
        print(f"DEBUG: Found UV layer '{mesh.uv_layers.active.name}' with {len(uv_layer)} loops.")
        for i, loop in enumerate(uv_layer):
            print(f"DEBUG: UV[{i}] = {loop.uv.x}, {loop.uv.y}")

    # Check Material
    if not obj.material_slots:
        print("DEBUG: No material slots!")
        return

    mat = obj.material_slots[0].material
    print(f"DEBUG: Material name: {mat.name}")
    if not mat.use_nodes:
        print("DEBUG: Material does not use nodes!")
        return

    tree = mat.node_tree
    print("DEBUG: Nodes in material:")
    tex_node = None
    bsdf_node = None
    for node in tree.nodes:
        print(f"  - {node.name} ({node.type})")
        if node.type == 'TEX_IMAGE':
            tex_node = node
            if node.image:
                print(f"    Image: {node.image.filepath}")
            else:
                print("    Image: NONE!")
        if node.type == 'BSDF_PRINCIPLED':
            bsdf_node = node

    print("DEBUG: Links in material:")
    for link in tree.links:
        print(f"  - {link.from_node.name}.{link.from_socket.name} -> {link.to_node.name}.{link.to_socket.name}")

debug()
