import bpy
import sys

def print_hierarchy(obj, indent=""):
    print(f"{indent}- {obj.name} (Type: {obj.type})")
    for mat_slot in obj.material_slots:
        if mat_slot.material:
            print(f"{indent}  Material: {mat_slot.material.name}")
    for child in obj.children:
        print_hierarchy(child, indent + "  ")

def main():
    print("\n--- OBJECT HIERARCHY ---")
    # Start with root objects (objects without a parent)
    for obj in bpy.context.scene.objects:
        if not obj.parent:
            print_hierarchy(obj)
            
    print("\n--- ALL MATERIALS ---")
    for mat in bpy.data.materials:
        print(f"- {mat.name}")
        
    print("\n--- IMAGE TEXTURES ---")
    for img in bpy.data.images:
        print(f"- {img.name}")

if __name__ == "__main__":
    main()
