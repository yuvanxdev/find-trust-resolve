import requests
import time
import sys

BASE_URL = "http://127.0.0.1:8000/api"

def assert_pass(condition, msg, fail_msg=None):
    if condition:
        print(f"[PASS] {msg}")
    else:
        print(f"[FAIL] {fail_msg or msg}")
        sys.exit(1)

def e2e_test():
    print("--- E2E Test Started ---")
    
    # 1. Register User A
    res_a = requests.post(f"{BASE_URL}/auth/register", json={"email": "user_a_10@e2e.com", "password": "pass", "name": "User A"})
    if res_a.status_code == 400 and "already registered" in res_a.text:
        pass # Already exists, fine for reruns
    res = requests.post(f"{BASE_URL}/auth/login", data={"username": "user_a_10@e2e.com", "password": "pass"})
    token_a = res.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    assert_pass(True, "User A registration and login")

    # 1b. Register User B
    res_b = requests.post(f"{BASE_URL}/auth/register", json={"email": "user_b_10@e2e.com", "password": "pass", "name": "User B"})
    if res_b.status_code == 400 and "already registered" in res_b.text:
        pass
    res = requests.post(f"{BASE_URL}/auth/login", data={"username": "user_b_10@e2e.com", "password": "pass"})
    token_b = res.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    assert_pass(True, "User B registration and login")

    # 1c. Register User C
    res_c = requests.post(f"{BASE_URL}/auth/register", json={"email": "user_c_10@e2e.com", "password": "pass", "name": "User C"})
    if res_c.status_code == 400 and "already registered" in res_c.text:
        pass
    res = requests.post(f"{BASE_URL}/auth/login", data={"username": "user_c_10@e2e.com", "password": "pass"})
    token_c = res.json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}
    assert_pass(True, "User C registration and login")

    # 2. User A Reports Lost Item
    res = requests.post(f"{BASE_URL}/items/", headers=headers_a, data={
        "report_type": "LOST",
        "item_name": "E2E Phone 10",
        "description": "Black phone lost in e2e park 10",
        "category": "electronics",
        "location": "E2E Park"
    }, files={"image": ("dummy.jpg", open("dummy.jpg", "rb"), "image/jpeg")})
    assert_pass(res.status_code == 201, "User A lost item creation")
    item_a = res.json()

    # 3. User B Discovers A's item
    res = requests.get(f"{BASE_URL}/items/discover", headers=headers_b)
    assert_pass(res.status_code == 200, "User B discovery API works")
    items_b_sees = res.json()
    assert_pass(any(i["id"] == item_a["id"] for i in items_b_sees), "User B discovery sees User A item")

    # 4. User B Reports Found Item
    res = requests.post(f"{BASE_URL}/items/", headers=headers_b, data={
        "report_type": "FOUND",
        "item_name": "E2E Phone Found 10",
        "description": "Black phone found in e2e park 10",
        "category": "electronics",
        "location": "E2E Park"
    }, files={"image": ("dummy.jpg", open("dummy.jpg", "rb"), "image/jpeg")})
    assert_pass(res.status_code == 201, "User B found item creation")
    item_b = res.json()

    # 5. User A Discovers B's item
    res = requests.get(f"{BASE_URL}/items/discover", headers=headers_a)
    assert_pass(any(i["id"] == item_b["id"] for i in res.json()), "User A discovery sees User B item")

    # 6. Wait for Background tasks (matching)
    print("Waiting for AI matching (up to 30s)...")
    
    # 7. Check Matches for User A
    match = None
    for _ in range(15):
        time.sleep(2)
        res = requests.get(f"{BASE_URL}/matches/", headers=headers_a)
        if res.status_code == 200:
            matches = res.json()
            for m in matches:
                if (m["lost_item_id"] == item_a["id"] and m["found_item_id"] == item_b["id"]) or (m["found_item_id"] == item_a["id"] and m["lost_item_id"] == item_b["id"]):
                    match = m
                    break
            if match:
                break

    assert_pass(match is not None, "AI match creation deterministic logic")

    match_id = match["id"]

    # 8. User C Authorization Check
    res = requests.post(f"{BASE_URL}/matches/{match_id}/accept", headers=headers_c)
    assert_pass(res.status_code in [403, 404], "Unauthorized User C blocked from accepting match")

    # 9. User A starts verification
    res = requests.post(f"{BASE_URL}/verification/start/{match_id}", headers=headers_a)
    assert_pass(res.status_code == 200, "User A starts Gemini verification")
    ver = res.json()
    
    # 10. User A submits answers
    answers = {str(q["question_id"]): "E2E automated response" for q in ver["questions"]}
    res = requests.post(f"{BASE_URL}/verification/answer/{ver['verification_id']}", headers=headers_a, json={"answers": answers})
    assert_pass(res.status_code == 200, "Gemini verification answers submitted correctly")

    # 11. Check Notifications for User B
    res = requests.get(f"{BASE_URL}/notifications/", headers=headers_b)
    assert_pass(res.status_code == 200, "Notification retrieval")
    notif_count = res.json()["total"]
    assert_pass(notif_count > 0, "Notification generated")

    notif_id = res.json()["items"][0]["id"]
    res = requests.patch(f"{BASE_URL}/notifications/{notif_id}/read", headers=headers_b)
    assert_pass(res.status_code == 200, "Notification read state persisted")

    # 12. Match acceptance
    res = requests.post(f"{BASE_URL}/matches/{match_id}/accept", headers=headers_a)
    assert_pass(res.status_code == 200, "Match acceptance successful")

    # 13. Duplicate resolution rejected
    res = requests.post(f"{BASE_URL}/matches/{match_id}/reject", headers=headers_a)
    assert_pass(res.status_code == 409, "Duplicate resolution rejected with 409")

    print("--- E2E Test Completed Successfully ---")

if __name__ == "__main__":
    e2e_test()
