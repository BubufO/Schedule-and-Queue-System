"""Database-backed auth/profile behavior across application restarts."""
import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.main import app
from app.models import UserCredentials, UserProfile
from app.security import verify_password
from app.store import Store, get_store
from app.users import get_user, save_user
from test_auth import NEW_USER, login, register_and_verify, client, store


def test_account_survives_restart(client, seeded_db):
    account = register_and_verify(client).json()['account']
    with Session(seeded_db.bind) as fresh:
        user = get_user(fresh, account['id'])
        assert user.display_name == NEW_USER['displayName']
        assert verify_password('secret123', user.password_hash)
        assert fresh.get(UserProfile, user.id) is not None
    restarted = Store(seed=False)
    app.dependency_overrides[get_store] = lambda: restarted
    headers = login(client, 'samlee', 'secret123')
    assert client.get('/profile', headers=headers).json()['email'] == 'sam@example.com'


def test_profile_password_persistence(client, seeded_db):
    headers, other = login(client), login(client)
    response = client.patch('/profile', headers=headers, json={
        'displayName': 'Updated Name', 'phone': '5551234567', 'notifySms': True,
        'email': 'updated@example.com', 'username': 'updated'})
    assert response.status_code == 200, response.text
    assert client.post('/profile/password', headers=headers, json={
        'currentPassword': 'password', 'newPassword': 'newsecret123'}).status_code == 204
    assert client.get('/profile', headers=other).status_code == 401
    with Session(seeded_db.bind) as fresh:
        saved = get_user(fresh, 'usr-client')
        assert saved.display_name == 'Updated Name'
        assert saved.notify_sms and saved.phone == '5551234567'
        assert verify_password('newsecret123', saved.password_hash)
    restarted = Store(seed=False)
    app.dependency_overrides[get_store] = lambda: restarted
    login(client, 'updated', 'newsecret123')
    assert client.post('/auth/login', json={'username': 'updated', 'password': 'password'}).status_code == 401


def test_duplicate_rollback(client, seeded_db):
    register_and_verify(client)
    user = get_user(seeded_db, 'usr-client')
    user.id, user.username = 'collision', 'SAMLEE'
    with pytest.raises(HTTPException) as error:
        save_user(seeded_db, user, create=True)
    assert error.value.status_code == 409
    assert seeded_db.get(UserCredentials, 'collision') is None
    assert seeded_db.get(UserProfile, 'collision') is None


def test_profile_validation(client):
    headers = login(client)
    for body, code in [({'username':'admin'},409), ({'email':'admin@example.com'},409),
                       ({'notifySms':True},409), ({'role':'admin'},422)]:
        assert client.patch('/profile', headers=headers, json=body).status_code == code
    assert client.post('/profile/password', headers=headers, json={
        'currentPassword':'wrong', 'newPassword':'newsecret123'}).status_code == 400
