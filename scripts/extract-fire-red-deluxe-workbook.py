"""Read the creator workbook without changing its contents or embedded images."""
import argparse
import json
from pathlib import Path

import openpyxl

parser = argparse.ArgumentParser()
parser.add_argument('workbook', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
output = {}
for sheet in workbook:
    rows = []
    for row_number, row in enumerate(sheet.iter_rows(), 1):
        cells = {cell.column_letter: cell.value for cell in row if cell.value is not None}
        if cells:
            rows.append({'row': row_number, 'cells': cells})
    output[sheet.title] = {'rows': rows}
args.output.write_text(json.dumps(output, default=str))
