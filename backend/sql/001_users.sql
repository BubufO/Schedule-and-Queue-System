-- Apply once. Email is referenced through the shared user ID.
BEGIN;


CREATE TABLE user_credentials (
	id VARCHAR(64) NOT NULL, 
	username VARCHAR(32) NOT NULL, 
	email VARCHAR(254) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role VARCHAR(10) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT chk_user_id CHECK (length(trim(id)) BETWEEN 1 AND 64), 
	CONSTRAINT chk_username_length CHECK (length(username) BETWEEN 3 AND 32), 
	CONSTRAINT chk_email_length CHECK (length(trim(email)) BETWEEN 3 AND 254), 
	CONSTRAINT chk_password_hash_length CHECK (length(password_hash) BETWEEN 1 AND 255), 
	CONSTRAINT chk_user_role CHECK (role IN ('client', 'admin'))
)

;

CREATE UNIQUE INDEX uq_user_email ON user_credentials (lower(email));

CREATE UNIQUE INDEX uq_user_username ON user_credentials (lower(username));


CREATE TABLE user_profiles (
	user_id VARCHAR(64) NOT NULL, 
	display_name VARCHAR(60) NOT NULL, 
	phone VARCHAR(16), 
	notify_email BOOLEAN NOT NULL, 
	notify_sms BOOLEAN NOT NULL, 
	notify_in_app BOOLEAN NOT NULL, 
	PRIMARY KEY (user_id), 
	CONSTRAINT chk_profile_name CHECK (length(trim(display_name)) BETWEEN 1 AND 60), 
	CONSTRAINT chk_profile_phone CHECK (phone IS NULL OR length(phone) BETWEEN 10 AND 16), 
	CONSTRAINT chk_sms_phone CHECK (NOT notify_sms OR phone IS NOT NULL), 
	FOREIGN KEY(user_id) REFERENCES user_credentials (id) ON DELETE CASCADE
)

;

COMMIT;
