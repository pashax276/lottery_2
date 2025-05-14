#!/bin/bash
# direct-auth-route-fix.sh
# This script directly fixes the auth route by adding explicit route handlers

# Check if file exists
if [ ! -f "backend/main.py" ]; then
    echo "Error: backend/main.py not found. Make sure you're running this from the project root directory."
    exit 1
fi

echo "Creating backup of main.py..."
cp backend/main.py backend/main.py.bak.$(date +%Y%m%d%H%M%S)

echo "Examining the route definitions in backend/main.py..."
grep -n "@app.post" backend/main.py | grep "auth/token" || echo "No auth/token route found"
grep -n "login_for_access_token" backend/main.py
grep -n "OAuth2PasswordBearer" backend/main.py

echo "Creating a direct fix for the auth route..."

# Create a temporary patch file
cat > auth_route_patch.py << 'EOF'
import re

def fix_auth_route(file_path):
    with open(file_path, 'r') as file:
        content = file.read()
    
    # Find the login_for_access_token function
    login_function_match = re.search(r'async def login_for_access_token\([^)]*\):', content)
    if not login_function_match:
        print("Could not find login_for_access_token function!")
        return False
    
    # Find the position to insert our new route
    start_pos = login_function_match.start()
    
    # Look for existing route decorators
    route_match = re.search(r'@app\.post\(["\'].*auth/token["\'].*\)', content[:start_pos])
    
    # Prepare the new route declarations
    if route_match:
        print(f"Found existing route: {route_match.group(0)}")
        # Replace the existing route with our corrected versions
        corrected_content = content.replace(
            route_match.group(0),
            '@app.post("/api/auth/token", response_model=Token)\n@app.post("/auth/token", response_model=Token)'
        )
    else:
        print("No existing route found, adding new routes")
        # Add new route declarations before the function
        corrected_content = content[:start_pos] + '@app.post("/api/auth/token", response_model=Token)\n@app.post("/auth/token", response_model=Token)\n' + content[start_pos:]
    
    # Fix OAuth2PasswordBearer tokenUrl
    oauth_match = re.search(r'oauth2_scheme\s*=\s*OAuth2PasswordBearer\(tokenUrl="[^"]+"\)', corrected_content)
    if oauth_match:
        print(f"Found OAuth2 configuration: {oauth_match.group(0)}")
        corrected_content = corrected_content.replace(
            oauth_match.group(0),
            'oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)'
        )
    
    # Write the corrected content back to the file
    with open(file_path, 'w') as file:
        file.write(corrected_content)
    
    print("Auth route fixed successfully")
    return True

fix_auth_route("backend/main.py")
EOF

# Run the Python script
python3 auth_route_patch.py

echo "Checking auth routes after fix..."
grep -n "@app.post" backend/main.py | grep "auth/token" || echo "No auth/token route found"
grep -n "OAuth2PasswordBearer" backend/main.py

echo "Updating nginx configuration to ensure proper routing..."
cp nginx.conf nginx.conf.bak.$(date +%Y%m%d%H%M%S)

cat > nginx.conf << 'EOF'
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Enable error logging with maximum detail
    error_log /var/log/nginx/error.log debug;
    access_log /var/log/nginx/access.log;

    # API proxy configuration - don't rewrite paths
    location /api/ {
        proxy_pass http://backend:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        
        # Add CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

        # Handle OPTIONS method directly
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
        
        # Timeout settings
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        proxy_buffers 16 16k;
        proxy_buffer_size 16k;
    }

    # WebSocket proxy for socket.io
    location /socket.io/ {
        proxy_pass http://backend:5001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400; # 24 hours
    }

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
}
EOF

echo "Creating a direct fix for Login.tsx to ensure correct URL use..."
cp src/components/Login.tsx src/components/Login.tsx.bak.$(date +%Y%m%d%H%M%S)

cat > login_fix.py << 'EOF'
import re

def fix_login_component(file_path):
    with open(file_path, 'r') as file:
        content = file.read()
    
    # Fix the login URL construction to use an absolute path
    login_url_pattern = r'const loginUrl = .*?;'
    if re.search(login_url_pattern, content):
        fixed_content = re.sub(login_url_pattern, "const loginUrl = '/api/auth/token';", content)
        
        # Also fix the API check URL if present
        api_check_pattern = r"fetch\('.*?/api/health'\)"
        if re.search(api_check_pattern, fixed_content):
            fixed_content = re.sub(api_check_pattern, "fetch('/api/health')", fixed_content)
        
        with open(file_path, 'w') as file:
            file.write(fixed_content)
        
        print(f"Updated Login.tsx to use absolute path for auth token URL")
        return True
    else:
        print(f"Could not find login URL pattern in {file_path}")
        return False

fix_login_component("src/components/Login.tsx")
EOF

python3 login_fix.py

echo "Adding debug log statement to print the request URL in backend..."
cat > debug_patch.py << 'EOF'
import re

def add_debug_logging(file_path):
    with open(file_path, 'r') as file:
        content = file.read()
    
    # Find the login_for_access_token function
    login_function_match = re.search(r'async def login_for_access_token\([^:]*\):', content)
    if not login_function_match:
        print("Could not find login_for_access_token function")
        return False
    
    # Find the position to insert our debug code
    start_pos = login_function_match.end()
    
    # Add the debug logging after the function definition line
    debug_code = """
    # Debug the request
    logger.info(f"Login attempt for user: {form_data.username} at URL: {form_data}")
    logger.info(f"Request headers: {request.headers if hasattr(request, 'headers') else 'No headers'}")
    """
    
    # Insert the debug code
    content_lines = content.splitlines()
    function_line_no = content[:start_pos].count('\n')
    content_lines.insert(function_line_no + 1, debug_code)
    
    # Write the updated content back to the file
    with open(file_path, 'w') as file:
        file.write('\n'.join(content_lines))
    
    print("Added debug logging to login_for_access_token function")
    return True

add_debug_logging("backend/main.py")
EOF

python3 debug_patch.py

echo "Creating a direct fix in the auth.py file to check authentication routes..."
if [ -f "backend/auth.py" ]; then
    cp backend/auth.py backend/auth.py.bak.$(date +%Y%m%d%H%M%S)
    
    # Check for OAuth2PasswordBearer configuration in auth.py
    grep -n "OAuth2PasswordBearer" backend/auth.py
    
    cat > auth_module_fix.py << 'EOF'
import re

def fix_auth_module(file_path):
    with open(file_path, 'r') as file:
        content = file.read()
    
    # Find and fix OAuth2PasswordBearer in auth.py
    oauth_pattern = r'oauth2_scheme\s*=\s*OAuth2PasswordBearer\(tokenUrl="[^"]+", auto_error=False\)'
    if re.search(oauth_pattern, content):
        fixed_content = re.sub(oauth_pattern, 'oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)', content)
        
        with open(file_path, 'w') as file:
            file.write(fixed_content)
        
        print(f"Updated auth.py OAuth2PasswordBearer configuration")
        return True
    else:
        print(f"Could not find OAuth2PasswordBearer pattern in {file_path}")
        return False

fix_auth_module("backend/auth.py")
EOF

    python3 auth_module_fix.py
else
    echo "backend/auth.py not found, skipping auth module fix"
fi

echo "Creating a test user in the database..."
cat > create_test_user.py << 'EOF'
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import bcrypt

# Connection parameters
dbname = "powerball"
user = "powerball"
password = "powerball"
host = "localhost"
port = "5432"

# Connect to database
try:
    conn = psycopg2.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port
    )
    conn.autocommit = True
    
    # Hash password for test user
    test_password = "test123"
    hashed_password = bcrypt.hashpw(test_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        # Check if 'testuser' already exists
        cursor.execute("SELECT * FROM users WHERE username = 'testuser'")
        if cursor.fetchone():
            print("Test user already exists, updating password")
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE username = 'testuser'",
                (hashed_password,)
            )
        else:
            print("Creating new test user")
            cursor.execute(
                "INSERT INTO users (username, email, password_hash, is_admin) VALUES (%s, %s, %s, %s)",
                ("testuser", "test@example.com", hashed_password, False)
            )
        
        # Add user stats for the test user
        cursor.execute("SELECT id FROM users WHERE username = 'testuser'")
        user_id = cursor.fetchone()['id']
        
        cursor.execute("SELECT * FROM user_stats WHERE user_id = %s", (user_id,))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO user_stats (user_id, draws_added, predictions_made, analysis_runs, checks_performed, wins) VALUES (%s, 0, 0, 0, 0, 0)",
                (user_id,)
            )
        
        print(f"Test user created/updated with ID: {user_id}")
        print(f"Username: testuser, Password: {test_password}")
    
    conn.close()
    print("Database connection closed")

except Exception as e:
    print(f"Error: {e}")
EOF

echo "Fixes applied successfully!"
echo "To apply the fix, run:"
echo "1. docker-compose down"
echo "2. docker-compose up -d"
echo "3. After containers are up, run: docker exec lottery_2-backend-1 python3 /app/create_test_user.py"
echo "4. Try logging in with username 'testuser' and password 'test123'"