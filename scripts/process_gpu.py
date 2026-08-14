import bpy

def process_gpu():
    # Load branding image
    branding_path = "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public/branding.png"
    try:
        img = bpy.data.images.load(branding_path)
    except:
        print(f"Could not load {branding_path}")
        return

    # Find logo material
    logo_mat = bpy.data.materials.get("logo")
    if logo_mat:
        logo_mat.use_nodes = True
        nodes = logo_mat.node_tree.nodes
        links = logo_mat.node_tree.links
        
        # clear nodes
        for node in nodes:
            nodes.remove(node)
            
        bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
        tex = nodes.new(type='ShaderNodeTexImage')
        tex.image = img
        out = nodes.new(type='ShaderNodeOutputMaterial')
        
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        
        print("Updated logo material with branding.png")
    else:
        print("Could not find 'logo' material")

    # Export to GLB
    out_path = "/Users/bhavyakumarsoni/.gemini/antigravity-ide/scratch/sparshika3d/public/gpu_rtx.glb"
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=False, # Export everything
        export_materials='EXPORT'
    )
    print(f"Exported to {out_path}")

if __name__ == "__main__":
    process_gpu()
