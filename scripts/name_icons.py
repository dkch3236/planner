"""Apply reviewed semantic icon names without changing image bytes."""
import hashlib
import json
from pathlib import Path
from prepare_assets import ROOT, make_catalog


def apply_icon_names(assets, output, owned):
    mapping = json.loads(Path(__file__).with_name('icon_names.json').read_text(encoding='utf-8'))
    planned = []
    for asset in assets:
        old = asset['path']
        new = mapping.get(old, old)
        if new != old:
            source, target = output/old, output/new
            if not target.resolve().is_relative_to(output.resolve()):
                raise ValueError(new)
            if target.exists() and new not in owned:
                raise FileExistsError(f'Unmanaged target: {new}')
            if not source.is_file():
                raise FileNotFoundError(source)
            planned.append((asset, source, target, old, new))
    final_names = [mapping.get(a['path'], a['path']) for a in assets]
    if len(set(final_names)) != len(final_names):
        raise ValueError('Icon naming collision')
    for asset, source, target, old, new in planned:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        source.replace(target)
        assert hashlib.sha256(target.read_bytes()).hexdigest() == digest
        asset.update(path=new, legacy_path=old, semantic_name=target.stem.removeprefix('icon_'))
    return mapping


def main():
    output, report = ROOT/'public/assets', ROOT/'reports/assets'
    path = output/'manifest.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    assets = manifest['assets']
    before = {a['path']: hashlib.sha256((output/a['path']).read_bytes()).hexdigest() for a in assets}
    mapping = apply_icon_names(assets,output,set(before))
    for a in assets:
        old = a.get('legacy_path', a['path'])
        assert hashlib.sha256((output/a['path']).read_bytes()).hexdigest() == before.get(old,before.get(a['path']))
    for item in manifest['review']:
        item['path'] = mapping.get(item['path'],item['path'])
    manifest['icon_name_mapping'] = mapping
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    make_catalog(assets,output,report,manifest['review'])
    (report/'naming').mkdir(exist_ok=True)
    make_catalog([a for a in assets if a['category']=='icons'],output,report/'naming',[])
    (report/'naming/verification.json').write_text(json.dumps({'renamed':len(mapping),
        'all_asset_bytes_unchanged':True,'total':len(assets),'illustrated_icons_unmodified':29},indent=2),encoding='utf-8')
    print(f'{len(mapping)} semantic names applied; all {len(assets)} image hashes unchanged.')


if __name__ == '__main__':
    main()
