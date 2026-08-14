import re

with open('scripts/blender_r760_generator.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    match = re.search(r'^\s*([a-zA-Z0-9_]+)\.name\s*=\s*(.*)', line)
    if match:
        obj_var = match.group(1)
        # Add a line to also set the data name
        indent = line[:len(line) - len(line.lstrip())]
        new_lines.append(f"{indent}{obj_var}.data.name = {obj_var}.name\n")

with open('scripts/blender_r760_generator.py', 'w') as f:
    f.writelines(new_lines)
