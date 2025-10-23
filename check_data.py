import json

# Check results
with open('data/results.json') as f:
    data = json.load(f)

print(f'Total profiles: {len(data)}')

valid = [p for p in data if p.get('name') and not p.get('error')]
print(f'Valid profiles with names: {len(valid)}')

# Check Bhaskar
bhaskar = [p for p in data if 'Bhaskar' in p.get('name', '')]
print(f'\nBhaskar entries found: {len(bhaskar)}')
for p in bhaskar:
    print(f"  - {p['name']}: {len(p['titles'])} badges")
    print(f"    URL: {p['url']}")
    if len(p['titles']) > 0:
        print(f"    First 3 badges: {p['titles'][:3]}")
