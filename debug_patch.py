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
