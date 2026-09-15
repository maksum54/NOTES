# -*- coding: utf-8 -*-
"""
Bungkus build_indorack_wallmount_rack.py jadi satu graph Dynamo (.dyn),
supaya di Revit tinggal: Manage > Dynamo > Open > Run.

    python3 make_dyn.py
"""
import json, os, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'scripts', 'build_indorack_wallmount_rack.py')
OUT = os.path.join(ROOT, 'dynamo', 'Buat_Family_Indorack_WIR7010S.dyn')

TAIL = '''

# --- output untuk node Dynamo ---
try:
    OUT = '\\n'.join(LOG)
except Exception:
    OUT = 'selesai'
'''


def port(name, desc, idx, is_input):
    return {
        "Id": str(uuid.uuid4()),
        "Name": name,
        "Description": desc,
        "UsingDefaultValue": False,
        "Level": 2,
        "UseLevels": False,
        "KeepListStructure": False,
    }


def main():
    code = open(SRC).read() + TAIL
    node_id = str(uuid.uuid4())
    out_port = port("OUT", "Log hasil pembuatan family", 0, False)

    graph = {
        "Uuid": str(uuid.uuid4()),
        "IsCustomNode": False,
        "Description": ("Membuat family Revit parametrik Indorack Wallmount Rack 19\" "
                        "(WIR7010S) lengkap dengan parameter Depth / Width / Height / U."),
        "Name": "Buat Family Indorack WIR7010S",
        "ElementResolver": {"ResolutionMap": {}},
        "Inputs": [],
        "Outputs": [],
        "Nodes": [{
            "ConcreteType": "PythonNodeModels.PythonNode, PythonNodeModels",
            "Code": code,
            "Engine": "CPython3",
            "EngineName": "CPython3",
            "VariableInputPorts": True,
            "Id": node_id,
            "NodeType": "PythonScriptNode",
            "Inputs": [],
            "Outputs": [out_port],
            "Replication": "Disabled",
            "Description": "Builder family Indorack Wallmount Rack 19 inch."
        }],
        "Connectors": [],
        "Dependencies": [],
        "NodeLibraryDependencies": [],
        "EnableLegacyPolyCurveBehavior": True,
        "Thumbnail": "",
        "GraphDocumentationURL": None,
        "ExtensionWorkspaceData": [],
        "Author": "",
        "Linting": {
            "activeLinter": "None",
            "activeLinterId": "7b75fb44-43fd-4631-a878-29f4d5d8399a",
            "warningCount": 0,
            "errorCount": 0
        },
        "Bindings": [],
        "View": {
            "Dynamo": {
                "ScaleFactor": 1.0,
                "HasRunWithoutCrash": False,
                "IsVisibleInDynamoLibrary": True,
                "Version": "3.0.3.7597",
                "RunType": "Manual",
                "RunPeriod": "1000"
            },
            "Camera": {
                "Name": "_Background Preview",
                "EyeX": -17.0, "EyeY": 24.0, "EyeZ": 50.0,
                "LookX": 12.0, "LookY": -13.0, "LookZ": -58.0,
                "UpX": 0.0, "UpY": 1.0, "UpZ": 0.0
            },
            "ConnectorPins": [],
            "NodeViews": [{
                "Id": node_id,
                "Name": "Indorack Wallmount Rack Builder",
                "IsSetAsInput": False,
                "IsSetAsOutput": False,
                "Excluded": False,
                "ShowGeometry": True,
                "X": 320.0,
                "Y": 240.0
            }],
            "Annotations": [],
            "X": 0.0, "Y": 0.0, "Zoom": 1.0
        }
    }

    folder = os.path.dirname(OUT)
    if not os.path.isdir(folder):
        os.makedirs(folder)
    with open(OUT, 'w') as fh:
        json.dump(graph, fh, indent=2)
    print('DYN ditulis :', OUT)
    print('baris kode  :', code.count('\n') + 1)
    return OUT


if __name__ == '__main__':
    main()
