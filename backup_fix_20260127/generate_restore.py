import os
import re

def parse_line(line):
    # Remove leading/trailing pipes and whitespace
    cleaned = line.strip('| \n')
    if not cleaned or '---' in cleaned or 'posicao' in cleaned.lower():
        return None
    
    parts = [p.strip() for p in cleaned.split('|')]
    # Expecting at least: posicao, user_id, user_name, contagem_real, ..., ultima_contagem/last_count
    # Based on user input:
    # | 4 | 722... | Name | 107 | 147 | -40 | date | 2026-01-25... |
    # Indices: 0=pos, 1=id, 2=name, 3=real, 4=table, 5=diff, 6=first, 7=last
    
    if len(parts) < 4:
        return None
        
    try:
        user_id = parts[1]
        user_name = parts[2]
        count_real = int(parts[3])
        # last_count is typically the last column, or the 8th column (index 7)
        last_count = parts[7] if len(parts) > 7 else 'NOW()' # Fallback
        
        return {
            'id': user_id,
            'name': user_name,
            'count': count_real,
            'last_count': last_count
        }
    except ValueError:
        return None

def main():
    folder = os.path.dirname(os.path.abspath(__file__))
    source_file = os.path.join(folder, 'ranking_source.txt')
    dest_file = os.path.join(folder, 'restore_ranking.sql')
    
    print(f"Reading {source_file}...")
    
    if not os.path.exists(source_file):
        print("Source file not found!")
        return

    users = []
    with open(source_file, 'r', encoding='utf-8') as f:
        for line in f:
            u = parse_line(line)
            if u:
                users.append(u)
                
    print(f"Found {len(users)} users.")
    
    if not users:
        print("No valid data found. Check formatting.")
        return

    with open(dest_file, 'w', encoding='utf-8') as f:
        f.write("-- Restore Ranking Script\n")
        f.write("-- Generated from ranking_source.txt\n\n")
        f.write("INSERT INTO users (id, name, total_count, last_count_at) VALUES\n")
        
        lines = []
        for u in users:
            # Escape single quotes in name
            safe_name = u['name'].replace("'", "''")
            line = f"('{u['id']}', '{safe_name}', {u['count']}, '{u['last_count']}')"
            lines.append(line)
            
        f.write(",\n".join(lines))
        f.write("\nON CONFLICT (id) DO UPDATE SET\n")
        f.write("  name = EXCLUDED.name,\n")
        f.write("  total_count = EXCLUDED.total_count,\n")
        f.write("  last_count_at = EXCLUDED.last_count_at;\n")
        
    print(f"Generated {dest_file}")

if __name__ == "__main__":
    main()
